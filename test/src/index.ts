/* eslint-disable no-empty */
import Jecs, { pair, type World as _world } from "@rbxts/jecs"
import { world, A, B, P } from "./cts"

const C = world.entity()

export const system = () => {
	for (const [e, a] of world.query(A, B)) {
		if (math.random() > 0.5) break
	}

	for (const [,] of world.query(A, B, C)) {
		for (const [,] of world.query(A, B)) {
			break
		}
	}

	for (const [,] of world.query(A).with(B).without(C)) {
	}

	for (const [,] of /* no-cache */ world.query(A).with(B).without(C)) {
	}

	const D = math.random() > 0.5 ? A : C
	for (const [,] of world.query(D)) {
	}

	for (const [,] of world.query(P)) {
	}

	for (const [, { __brand }] of world.query(pair(A, P))) {
	}
	for (const [,] of world.query(pair(A, D))) {
	}
}

export const worldSystem = ({ world }: { world: _world }) => {
	for (const [e, a] of world.query(A, B)) {
		if (math.random() > 0.5) break
	}

	for (const [,] of world.query(A, B, C)) {
		for (const [,] of world.query(A, B)) {
			break
		}
	}

	for (const [,] of world.query(A).with(B).without(C)) {
	}

	for (const [,] of /* no-cache */ world.query(A).with(B).without(C)) {
	}

	const D = math.random() > 0.5 ? A : C
	for (const [,] of world.query(D)) {
	}

	const result = world.query(A).iter()()

	for (const [, data] of world.query(P)) {
		print(data.__brand)
	}

	for (const [, { __brand }] of world.query(pair(A, P))) {
	}
	for (const [,] of world.query(pair(A, D))) {
	}
}

const isolatedGameWorld = Jecs.world()

export const functionWithWorldCreation = () => {
	for (const [e, a] of isolatedGameWorld.query(A, B)) {
	}
}

export const directParamWorld = (world: _world) => {
	for (const [e, a] of world.query(A, B)) {
		if (math.random() > 0.5) break
	}
}

declare function beforeEach(cb: () => void): void
declare function describe(name: string, cb: () => void): void
declare function it(name: string, cb: () => void): void

let testWorld: _world

describe("unit test", () => {
	beforeEach(() => {
		testWorld = Jecs.world()
	})

	it("can query entities", () => {
		for (const [e, a] of testWorld.query(A, B)) {
		}
	})
})
