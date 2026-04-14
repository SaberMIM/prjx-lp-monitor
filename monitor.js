const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

const RPC_URL = process.env.RPC_URL || "https://rpc.hyperliquid.xyz/evm";
const EXPLORER_API_BASE = process.env.EXPLORER_API_BASE || "https://www.hyperscan.com/api/v2";
const WALLET_ADDRESS = process.env.WALLET_ADDRESS;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const ALERT_THRESHOLD_PCT = Number(process.env.ALERT_THRESHOLD_PCT || "5");
const POSITIONS_NFT_CONTRACT = (
  process.env.POSITIONS_NFT_CONTRACT ||
  "0xead19ae861c29bbb2101e834922b2feee69b9091"
).toLowerCase();

const STATUS_FILE = path.join(process.cwd(), "status.json");
const STATE_DIR = path.join(process.cwd(), ".state");
const ALERT_STATE_FILE = path.join(STATE_DIR, "alert-state.json");
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const POSITION_MANAGER_ABI = [
  "function factory() view returns (address)",
  "function positions(uint256 tokenId) view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)"
];

const FACTORY_ABI = [
  "function getPool(address tokenA, address tokenB, uint24 fee) view returns (address)"
];

const POOL_ABI = [
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)"
];

const ERC20_ABI = [
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)"
];

function ensureStateDir() {
  if (!fs.existsSync(STATE_DIR)) {
    fs.mkdirSync(STATE_DIR, { recursive: true });
  }
}

function readJsonSafe(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function round(num, digits = 2) {
  return Number(Number(num).toFixed(digits));
}

function tickToPrice(tick, dec0, dec1) {
  return Math.pow(1.0001, tick) * Math.pow(10, dec0 - dec1);
}

function buildAlertKey(position) {
  if (!position.inRange) return "out";
  if (position.nearLower) return "near-lower";
  if (position.nearUpper) return "near-upper";
  return "normal";
}

function getRiskScore(position) {
  if (!position.inRange) return -1;
  return Math.min(position.distToLowerPct, position.distToUpperPct);
}

function shortAddr(addr) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      accept: "application/json"
    }
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status} for ${url}: ${body}`);
  }

  return res.json();
}

async function listOwnedPositionTokenIds(walletAddress) {
  const tokenIds = new Set();
  let nextPageParams = null;

  for (let page = 0; page < 50; page += 1) {
    const params = new URLSearchParams({ type: "ERC-721" });

    if (nextPageParams) {
      for (const [key, value] of Object.entries(nextPageParams)) {
        if (value !== undefined && value !== null) {
          params.set(key, String(value));
        }
      }
    }

    const url = `${EXPLORER_API_BASE}/addresses/${walletAddress}/nft?${params.toString()}`;
    const data = await fetchJson(url);
    const items = Array.isArray(data.items) ? data.items : [];

    for (const item of items) {
      const contractAddress = item?.token?.address_hash?.toLowerCase?.() || "";
      const tokenId = item?.id ? String(item.id) : null;
      if (contractAddress === POSITIONS_NFT_CONTRACT && tokenId) {
        tokenIds.add(tokenId);
      }
    }

    if (!data.next_page_params) {
      break;
    }

    nextPageParams = data.next_page_params;
  }

  return Array.from(tokenIds);
}

async function sendTelegram(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.log("Telegram non configure, alerte ignoree.");
    return;
  }

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text
    })
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram error ${res.status}: ${body}`);
  }
}

async function buildPositionStatus(provider, pm, factoryAddress, tokenId) {
  const pos = await pm.positions(tokenId);
  const liquidity = BigInt(pos.liquidity.toString());

  if (liquidity === 0n) {
    return null;
  }

  const token0 = new ethers.Contract(pos.token0, ERC20_ABI, provider);
  const token1 = new ethers.Contract(pos.token1, ERC20_ABI, provider);

  const [sym0, dec0, sym1, dec1] = await Promise.all([
    token0.symbol(),
    token0.decimals(),
    token1.symbol(),
    token1.decimals()
  ]);

  const factory = new ethers.Contract(factoryAddress, FACTORY_ABI, provider);
  const poolAddress = await factory.getPool(pos.token0, pos.token1, pos.fee);

  if (!poolAddress || poolAddress.toLowerCase() === ZERO_ADDRESS) {
    throw new Error(`Pool introuvable pour tokenId ${tokenId}`);
  }

  const pool = new ethers.Contract(poolAddress, POOL_ABI, provider);
  const slot0 = await pool.slot0();

  const currentTick = Number(slot0.tick);
  const tickLower = Number(pos.tickLower);
  const tickUpper = Number(pos.tickUpper);

  const currentPrice = tickToPrice(currentTick, Number(dec0), Number(dec1));
  const lowerPrice = tickToPrice(tickLower, Number(dec0), Number(dec1));
  const upperPrice = tickToPrice(tickUpper, Number(dec0), Number(dec1));

  const inRange = currentTick >= tickLower && currentTick <= tickUpper;

  const distToLowerPct = round(((currentPrice - lowerPrice) / currentPrice) * 100, 2);
  const distToUpperPct = round(((upperPrice - currentPrice) / currentPrice) * 100, 2);

  const nearLower = inRange && distToLowerPct <= ALERT_THRESHOLD_PCT;
  const nearUpper = inRange && distToUpperPct <= ALERT_THRESHOLD_PCT;

  return {
    tokenId: String(tokenId),
    pair: `${sym0}/${sym1}`,
    token0Symbol: sym0,
    token1Symbol: sym1,
    fee: Number(pos.fee),
    liquidity: liquidity.toString(),
    inRange,
    nearLower,
    nearUpper,
    currentTick,
    tickLower,
    tickUpper,
    currentPrice: round(currentPrice, 8),
    lowerPrice: round(lowerPrice, 8),
    upperPrice: round(upperPrice, 8),
    distToLowerPct,
    distToUpperPct,
    closestBoundaryPct: inRange ? round(Math.min(distToLowerPct, distToUpperPct), 2) : -1,
    poolAddress
  };
}

function buildTelegramMessage(position, walletAddress) {
  const header = `PRJX LP ALERT\nWallet: ${shortAddr(walletAddress)}\nPosition #${position.tokenId}\n${position.pair}`;

  if (!position.inRange) {
    return [
      header,
      "OUT OF RANGE",
      `Lower distance: ${position.distToLowerPct}%`,
      `Upper distance: ${position.distToUpperPct}%`,
      `Current price: ${position.currentPrice}`
    ].join("\n");
  }

  if (position.nearLower) {
    return [
      header,
      "Near LOWER boundary",
      `Distance: ${position.distToLowerPct}%`,
      `Current price: ${position.currentPrice}`,
      `Lower price: ${position.lowerPrice}`
    ].join("\n");
  }

  if (position.nearUpper) {
    return [
      header,
      "Near UPPER boundary",
      `Distance: ${position.distToUpperPct}%`,
      `Current price: ${position.currentPrice}`,
      `Upper price: ${position.upperPrice}`
    ].join("\n");
  }

  return [
    header,
    "Back in comfortable range",
    `Lower distance: ${position.distToLowerPct}%`,
    `Upper distance: ${position.distToUpperPct}%`
  ].join("\n");
}

async function main() {
  if (!WALLET_ADDRESS) {
    throw new Error("WALLET_ADDRESS manquant.");
  }

  ensureStateDir();

  const previousState = readJsonSafe(ALERT_STATE_FILE, { positions: {} });
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const pm = new ethers.Contract(POSITIONS_NFT_CONTRACT, POSITION_MANAGER_ABI, provider);
  const factoryAddress = await pm.factory();

  const tokenIds = await listOwnedPositionTokenIds(WALLET_ADDRESS);
  const positions = [];
  const errors = [];

  for (const tokenId of tokenIds) {
    try {
      const position = await buildPositionStatus(provider, pm, factoryAddress, tokenId);
      if (position) {
        positions.push(position);
      }
    } catch (error) {
      errors.push({ tokenId, error: String(error.message || error) });
    }
  }

  positions.sort((a, b) => getRiskScore(a) - getRiskScore(b));

  const outOfRangeCount = positions.filter((p) => !p.inRange).length;
  const nearestPosition = positions[0] || null;

  const status = {
    walletAddress: WALLET_ADDRESS,
    activePositionsCount: positions.length,
    outOfRangeCount,
    nearestPositionTokenId: nearestPosition ? nearestPosition.tokenId : null,
    worstDistancePct: nearestPosition ? nearestPosition.closestBoundaryPct : null,
    updatedAt: new Date().toISOString(),
    positions,
    errors
  };

  writeJson(STATUS_FILE, status);

  const nextAlertState = { positions: {} };

  for (const position of positions) {
    const alertKey = buildAlertKey(position);
    const previous = previousState.positions?.[position.tokenId]?.lastAlertKey ?? null;
    const changed = previous !== alertKey;
    const shouldSend = changed && (alertKey !== "normal" || (previous && previous !== "normal"));

    if (shouldSend) {
      await sendTelegram(buildTelegramMessage(position, WALLET_ADDRESS));
    }

    nextAlertState.positions[position.tokenId] = {
      lastAlertKey: alertKey,
      updatedAt: new Date().toISOString()
    };
  }

  writeJson(ALERT_STATE_FILE, nextAlertState);
  console.log("Status updated:", status);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
