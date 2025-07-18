/* eslint-disable no-empty */
import { pair, type World as _world } from "@rbxts/jecs"
import { world, A, B, P } from "./cts"

const C = world.entity()

export const system = () => {
	for (const [,] of world.query(A, B)) {
	}

	for (const [,] of world.query(A, B, C)) {
	}

	for (const [,] of world.query(A).with(B).without(C)) {
	}

	for (const [,] of /* no-cache */ world.query(A).with(B).without(C)) {
	}

	const D = math.random() > 0.5 ? A : B
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
	for (const [,] of world.query(A, B)) {
	}

	for (const [,] of world.query(A, B, C)) {
	}

	for (const [,] of world.query(A).with(B).without(C)) {
	}

	for (const [,] of /* no-cache */ world.query(A).with(B).without(C)) {
	}

	const D = math.random() > 0.5 ? A : B
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
