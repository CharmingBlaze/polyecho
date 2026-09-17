# Icons

Use **Blender-style glyphs** for editor chrome. Do not add Lucide (or another icon pack) for a tool, mode, or panel that already has a `BlenderIcon` name.

## Source of truth

`src/components/icons/BlenderIcon.vue`

```vue
<BlenderIcon name="brush" :size="14" />
```

- `name` is a string union on the component. Typecheck fails if the name is unknown.
- `size` is px (number or string). Default `16`.
- `color` defaults to `currentColor` so theme text classes tint the icon.

`UiSection` accepts `blender-icon="uv"` for the section header.

## When to add a glyph

1. Open `BlenderIcon.vue` and look for an existing alias (`brush` / `paint` / `tool-draw` are the same mark).
2. If none fits, add a 24×24 `viewBox` path next to its siblings, **and** add the name to the `name` prop union.
3. Prefer Blender’s own icon language (filled silhouette, 24 grid) over a marketing-style outline.

Do not invent a second icon component.

## Lucide is the exception, not the default

Lucide is allowed only when there is **no** Blender equivalent and the control is not a DCC tool:

- Window chrome with no Blender mark (e.g. a drag **grip** on a floating panel).
- Decorative ramps that are not tools (paint sun/moon shade chips).

If you reach for Lucide, first add the Blender glyph instead unless the case above applies. Do not mix Lucide and `BlenderIcon` in the same toolbar row.

## Where icons already live

| Surface | Expectation |
| :--- | :--- |
| Left toolbar, header, UV/Paint tools | `BlenderIcon` only |
| Viewport nav cluster (pan / orbit / zoom / frame) | `BlenderIcon` |
| Outliner / status / recover banner | `BlenderIcon` |
| Inspector rail and sheet heads | `BlenderIcon` at `currentColor` (one accent pip on the active tab) |
| Inspector section headers | `blender-icon` on `UiSection` |
| Timeline transport | `BlenderIcon` (`play` / `pause` / `skip-start` / `skip-end` / `record` / `film`) |

## Naming

Match existing kebab names: `tool-extrude`, `mesh-cube`, `shading-textured`, `uv-smart`, `eye-open`. Add aliases on the same `<g v-else-if>` when two menus mean the same mark.
