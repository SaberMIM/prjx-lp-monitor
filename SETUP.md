# Setup

This repository monitors Project X LP positions in read-only mode.

## GitHub secrets to add

Go to Settings > Secrets and variables > Actions and create:

- `WALLET_ADDRESS`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

## First test

1. Open Actions.
2. Open `PRJX LP Monitor`.
3. Run the workflow manually.
4. Check whether `status.json` updates.
5. Check whether Telegram receives an alert if one position is close to a boundary or out of range.

## iPhone widget

Copy the content of `widget.js` into a new Scriptable script and attach it to a medium widget.
