import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import type { Model } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { DynamicBorder } from "@mariozechner/pi-coding-agent";
import { Container, Input, Spacer, Text, fuzzyFilter, getKeybindings, Key } from "@mariozechner/pi-tui";

interface FavoriteEntry {
	provider: string;
	modelId: string;
}

interface ModelItem {
	provider: string;
	id: string;
	model: Model<any>;
	isFavorite: boolean;
}

const FAVORITES_PATH = join(homedir(), ".pi", "agent", "favorites.json");

function loadFavorites(): FavoriteEntry[] {
	if (!existsSync(FAVORITES_PATH)) return [];
	try {
		return JSON.parse(readFileSync(FAVORITES_PATH, "utf-8"));
	} catch {
		return [];
	}
}

function saveFavorites(favs: FavoriteEntry[]): void {
	const dir = dirname(FAVORITES_PATH);
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
	writeFileSync(FAVORITES_PATH, JSON.stringify(favs, null, 2));
}

function isFav(favs: FavoriteEntry[], provider: string, modelId: string): boolean {
	return favs.some((f) => f.provider === provider && f.modelId === modelId);
}

export default function (pi: ExtensionAPI) {
	let favorites: FavoriteEntry[] = [];

	function toggleFavorite(provider: string, modelId: string): boolean {
		const idx = favorites.findIndex((f) => f.provider === provider && f.modelId === modelId);
		if (idx !== -1) {
			favorites.splice(idx, 1);
			saveFavorites(favorites);
			return false;
		}
		favorites.push({ provider, modelId });
		saveFavorites(favorites);
		return true;
	}

	async function cycleFavorites(ctx: ExtensionContext): Promise<void> {
		if (favorites.length === 0) {
			ctx.ui.notify("No favorites. Use /fav to add models.", "warning");
			return;
		}

		const current = ctx.model;
		let nextIdx = 0;
		if (current) {
			const curIdx = favorites.findIndex((f) => f.provider === current.provider && f.modelId === current.id);
			nextIdx = curIdx === -1 ? 0 : (curIdx + 1) % favorites.length;
		}

		const next = favorites[nextIdx];
		const model = ctx.modelRegistry.find(next.provider, next.modelId);
		if (!model) {
			ctx.ui.notify(`Not available: (${next.provider}) ${next.modelId}`, "error");
			return;
		}

		const ok = await pi.setModel(model);
		if (ok) {
			ctx.ui.notify(`(${next.provider}) ${next.modelId}`, "info");
		} else {
			ctx.ui.notify(`No API key: (${next.provider}) ${next.modelId}`, "error");
		}
	}

	async function showPicker(ctx: ExtensionContext): Promise<void> {
		const availableModels = ctx.modelRegistry.getAvailable();
		if (availableModels.length === 0) {
			ctx.ui.notify("No models available", "warning");
			return;
		}

		const current = ctx.model;

		const buildItems = (): ModelItem[] => {
			const items: ModelItem[] = availableModels.map((m) => ({
				provider: m.provider,
				id: m.id,
				model: m,
				isFavorite: isFav(favorites, m.provider, m.id),
			}));
			items.sort((a, b) => {
				// Current model first
				const aCur = current && a.provider === current.provider && a.id === current.id;
				const bCur = current && b.provider === current.provider && b.id === current.id;
				if (aCur && !bCur) return -1;
				if (!aCur && bCur) return 1;
				// Favorites before non-favorites
				if (a.isFavorite && !b.isFavorite) return -1;
				if (!a.isFavorite && b.isFavorite) return 1;
				// Then by provider
				return a.provider.localeCompare(b.provider);
			});
			return items;
		};

		const result = await ctx.ui.custom<Model<any> | null>((tui, theme, _kb, done) => {
			let allItems = buildItems();
			let filteredItems = allItems;
			let selectedIndex = 0;
			const kb = getKeybindings();

			const container = new Container();
			container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
			container.addChild(new Text(theme.fg("accent", theme.bold("Favorite Models")), 0, 0));
			container.addChild(new Text(theme.fg("dim", "↑↓ navigate • tab toggle fav • enter switch • esc cancel"), 0, 0));
			container.addChild(new Spacer(1));

			const searchInput = new Input();
			container.addChild(searchInput);
			container.addChild(new Spacer(1));

			const listContainer = new Container();
			container.addChild(listContainer);
			container.addChild(new Spacer(1));
			container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));

			function filterItems(query: string): void {
				filteredItems = query
					? fuzzyFilter(allItems, query, (item) => `${item.id} ${item.provider}`)
					: allItems;
				selectedIndex = Math.min(selectedIndex, Math.max(0, filteredItems.length - 1));
			}

			function updateList(): void {
				listContainer.clear();
				const maxVisible = 10;
				const startIndex = Math.max(0, Math.min(selectedIndex - Math.floor(maxVisible / 2), filteredItems.length - maxVisible));
				const endIndex = Math.min(startIndex + maxVisible, filteredItems.length);

				for (let i = startIndex; i < endIndex; i++) {
					const item = filteredItems[i];
					if (!item) continue;
					const isSelected = i === selectedIndex;
					const isCurrent = current && item.provider === current.provider && item.id === current.id;
					const star = item.isFavorite ? "★ " : "  ";
					const check = isCurrent ? theme.fg("success", " ✓") : "";
					const providerBadge = theme.fg("muted", `[${item.provider}]`);

					let line: string;
					if (isSelected) {
						line = `${theme.fg("accent", "→ ")}${theme.fg("accent", star + item.id)} ${providerBadge}${check}`;
					} else {
						line = `  ${star}${item.id} ${providerBadge}${check}`;
					}
					listContainer.addChild(new Text(line, 0, 0));
				}

				if (startIndex > 0 || endIndex < filteredItems.length) {
					listContainer.addChild(new Text(theme.fg("muted", `  (${selectedIndex + 1}/${filteredItems.length})`), 0, 0));
				}

				if (filteredItems.length === 0) {
					listContainer.addChild(new Text(theme.fg("muted", "  No matching models"), 0, 0));
				}
			}

			updateList();

			return {
				render(width: number) { return container.render(width); },
				invalidate() { container.invalidate(); },
				handleInput(data: string) {
					if (kb.matches(data, "tui.select.up")) {
						if (filteredItems.length === 0) return;
						selectedIndex = selectedIndex === 0 ? filteredItems.length - 1 : selectedIndex - 1;
						updateList();
					} else if (kb.matches(data, "tui.select.down")) {
						if (filteredItems.length === 0) return;
						selectedIndex = selectedIndex === filteredItems.length - 1 ? 0 : selectedIndex + 1;
						updateList();
					} else if (kb.matches(data, "tui.select.confirm")) {
						const selected = filteredItems[selectedIndex];
						if (selected) done(selected.model);
					} else if (kb.matches(data, "tui.select.cancel")) {
						done(null);
					} else if (kb.matches(data, "tui.input.tab")) {
						const selected = filteredItems[selectedIndex];
						if (selected) {
							toggleFavorite(selected.provider, selected.id);
							allItems = buildItems();
							filterItems(searchInput.getValue());
							updateList();
						}
					} else {
						searchInput.handleInput(data);
						filterItems(searchInput.getValue());
						updateList();
					}
					tui.requestRender();
				},
			};
		});

		if (!result) return;

		const ok = await pi.setModel(result);
		if (ok) {
			ctx.ui.notify(`Switched to (${result.provider}) ${result.id}`, "info");
		} else {
			ctx.ui.notify(`No API key for (${result.provider}) ${result.id}`, "error");
		}
	}

	pi.registerShortcut(Key.ctrl("f"), {
		description: "Cycle favorite models",
		handler: async (ctx) => { await cycleFavorites(ctx); },
	});

	pi.registerCommand("fav", {
		description: "Browse models and manage favorites",
		handler: async (_args, ctx) => { await showPicker(ctx); },
	});

	pi.on("session_start", async () => { favorites = loadFavorites(); });
	pi.on("session_switch", async () => { favorites = loadFavorites(); });
}
