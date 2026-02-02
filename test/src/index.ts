/* eslint-disable no-empty */
import { pair, world as mkWorld } from "@rbxts/jecs"
import { world, A, B, P, ct } from "./cts"

const C = world.entity()
const localCt = {
	A: world.entity()	
}

export const system = () => {
	for (const [e, a] of world.query(A, B)) {
		if (math.random() > 0.5) break
	}

	for (const [,] of world.query(A, B, C)) {
		for (const [,] of world.query(A, B)) {
			break
		}
	}

	for (const [,] of world.query(ct.C, ct.inner.D)) {

	}

	for (const [,] of world.query(localCt.A)) {

	}

	const dynCt = { B: world.entity() }

	for (const [,] of world.query(dynCt.B)) {
		
	}

	for (const [,] of world.query())

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

export const worldSystem = ({ world }: { world: import("@rbxts/jecs").World }) => {	
	for (const [e, a] of world.query(A, B)) {
		if (math.random() > 0.5) break
	}

	for (const [,] of world.query(A, B, C)) {
		for (const [,] of world.query(A, B)) {
			break
		}
	}

	for (const [,] of world.query(ct.C, ct.inner.D)) {

	}

	for (const [,] of world.query(localCt.A)) {

	}

	const dynCt = { B: world.entity() }

	for (const [,] of world.query(dynCt.B)) {

	}

	for (const [,] of world.query())

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

let lazyWorld: import("@rbxts/jecs").World

new Promise(() => {
	lazyWorld = mkWorld()
})

export const worldSetLater = () => {
	for (const [e, a] of lazyWorld.query(A, B)) {
		if (math.random() > 0.5) break
	}

	for (const [,] of lazyWorld.query(A, B, C)) {
		for (const [,] of lazyWorld.query(A, B)) {
			break
		}
	}

	for (const [,] of lazyWorld.query(ct.C, ct.inner.D)) {

	}

	for (const [,] of lazyWorld.query(localCt.A)) {

	}

	const dynCt = { B: lazyWorld.entity() }

	for (const [,] of lazyWorld.query(dynCt.B)) {

	}

	for (const [,] of lazyWorld.query())

	for (const [,] of lazyWorld.query(A).with(B).without(C)) {
	}

	for (const [,] of /* no-cache */ lazyWorld.query(A).with(B).without(C)) {
	}

	const D = math.random() > 0.5 ? A : C
	for (const [,] of lazyWorld.query(D)) {
	}

	const result = lazyWorld.query(A).iter()()

	for (const [, data] of lazyWorld.query(P)) {
		print(data.__brand)
	}

	for (const [, { __brand }] of lazyWorld.query(pair(A, P))) {
	}
	for (const [,] of lazyWorld.query(pair(A, D))) {
	}
}
