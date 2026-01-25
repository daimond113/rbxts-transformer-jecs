import { world as World } from "@rbxts/jecs"

export const world = World()
export const A = world.entity()
export const B = world.component<string>()

export const ct = {
	C: world.entity(),
	inner: {
		D: world.entity(),
	}
}

type PrivateType = {
	readonly __brand: unique symbol
}
export const P = world.component<PrivateType>()
