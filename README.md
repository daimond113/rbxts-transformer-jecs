# rbxts-transformer-jecs

A [roblox-ts](https://roblox-ts.com) transformer for 
[Jecs](https://github.com/Ukendio/jecs).

For example, the following system:

```typescript
import { world } from "shared/world"
import { A, B } from "shared/cts"

const C = world.entity()

const system: System = () => {
	for (const [id, a, b] of world.query(A, B).with(C)) {
		print(`${id} has A: ${a} and B: ${b}`)
	}
}
```

will get compiled to

```luau
local A = _cts.A
local B = _cts.B
local C = world:entity()
local query_1 = world:query(A, B):with(C):cached()
local archetypes_1 = query_1:archetypes()
local system = function()
	for _, archetype_1 in archetypes_1 do
		local entities_1 = archetype_1.entities
		local field_1 = archetype_1.columns_map
		local A_1 = field_1[A]
		local B_1 = field_1[B]
		for row_1 = #entities_1, 1, -1 do
			local id = entities_1[row_1]
			local a = A_1[row_1]
			local b = B_1[row_1]
			do
				print(`{id} has A: {a} and B: {b}`)
			end
		end
	end
end
```

Worlds from non-singleton sources are also supported.

```typescript
const system: System = ({ world }) => {
	for (const [id, a, b] of world.query(A, B).with(C)) {
		print(`${id} has A: ${a} and B: ${b}`)
	}
}
```

compiles to

```luau
local query_1
local worldKey_1
local archetypes_1
local system = function(_param)
	local world = _param.world
	if worldKey_1 ~= world then
		worldKey_1 = world
		query_1 = world:query(A, B):with(C):cached()
		archetypes_1 = query_1:archetypes()
	end
	for _, archetype_1 in archetypes_1 do
		local entities_1 = archetype_1.entities
		local field_1 = archetype_1.columns_map
		local A_1 = field_1[A]
		local B_1 = field_1[B]
		for row_1 = #entities_1, 1, -1 do
			local id = entities_1[row_1]
			local a = A_1[row_1]
			local b = B_1[row_1]
			do
				print(`{id} has A: {a} and B: {b}`)
			end
		end
	end
end
```

## Usage

Install the package with your preferred package manager, then simply add it to
your `tsconfig.json` plugins array.

```json
{
	"compilerOptions": {
		"plugins": [
			{
				"transform": "rbxts-transformer-jecs"
			}
		]
	}
}
```

Additional options:
- `silent`: prevents "component is not simple. Query will not be cached." logs
- `jecsPackage`: the name of the Jecs package in your dependency tree. Defaults
to `@rbxts/jecs`