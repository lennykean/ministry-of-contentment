# Ministry of Contentment: All Is Well

A browser-based narrative investigation game that uses real PromQL and LogQL as player actions.

## Run locally

Requires Node.js `^20.19.0` or `>=22.12.0`.

```powershell
npm install
npm run dev
```

Open the loopback URL printed by Vite. Progress is saved in this browser only.

```powershell
npm test
npm run validate:content -- content/campaign.json
npm run build
```

The current campaign uses authored local telemetry fixtures. It does not deploy anything, contact Grafana, or change CORS or cluster configuration.

## The desk

The game is a single screen: a banner showing the clock and Ministry Standing, an in tray, a query console with a print bar, and a work column holding the open case and its report form. The registry, standing queries, personnel file, archive, and a list of keyboard shortcuts open as dialogs over the desk.

## Keyboard shortcuts

Letter keys work only when focus is not in the console or a form field.

| Keys | Action |
| --- | --- |
| `Enter` | Run the query in the console |
| `Shift` + `Enter` | Insert a line break in the query |
| `Ctrl` + `P` | Print the selected result |
| `1` to `4` | Choose the print view while the print bar has focus |
| `Alt` + `1` to `Alt` + `5` | Open the first five items in the in tray |
| `F` | File the report when the form is complete |
| `R` | Open the registry |
| `?` | Open the keyboard-shortcut list |
| `Esc` | Close any open dialog |
| Arrow keys | Move within the in tray and within a group of choices |

Hints have no clock cost, but can limit mastery credit. They open from the "Call Marr" control in the in tray footer.

The authoritative mechanics contract is [docs/GAME_MECHANICS.md](docs/GAME_MECHANICS.md).
