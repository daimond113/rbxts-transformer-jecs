# rbxts-transformer-jecs

A transformer for [roblox-ts](https://roblox-ts.com) to automatically cache
[Jecs](https://github.com/Ukendio/jecs) queries.

For example, the following system:

```typescript
import { world } from "shared/world"
import { A, B } from "shared/cts"

const C = world.entity()

const system: System = () => {
	for (const [id, a, b] of world.query(A, B).with(C)) {}
}
```

will get compiled to

```luau
local A = _cts.A
local B = _cts.B
local C = world:entity()
local query_1 = world:query(A, B):with(C):cached()
local system = function()
	for id, a, b in query_1 do
	end
end
```

Worlds from non-singleton sources are also supported.

```typescript
const system: System = ({ world }) => {
	for (const [id, a, b] of world.query(A, B).with(C)) {}
}
```

compiles to

```luau
local query_1
local worldKey_1
local system = function(_param)
	local world = _param.world
	if worldKey_1 ~= world then
		worldKey_1 = world
		query_1 = world:query(A, B):with(C):cached()
	end
	for id, a, b in query_1 do
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