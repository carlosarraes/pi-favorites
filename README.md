# pi-favorites

A [Pi coding-agent](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent) extension for managing favorite models with a fuzzy search picker.

## What it does

- Browse all available models with fuzzy search
- Star/unstar models as favorites
- Cycle through favorites with `Ctrl+X`
- Favorites persist across sessions in `~/.pi/agent/favorites.json`

## Install

```
pi install git:github.com/carlosarraes/pi-favorites
```

Requires `@mariozechner/pi-ai` and `@mariozechner/pi-coding-agent` >= 0.49.0.

## Usage

- `/fav` — open the favorites picker (fuzzy search, `Tab` to toggle star, `Enter` to switch)
- `Ctrl+X` — cycle through your favorite models

`Ctrl+P` (default model picker) still works as usual.

## License

MIT
