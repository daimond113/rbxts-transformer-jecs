import { describe, it } from "vitest"
import { compile } from "./index.js"
import { unindent } from "@antfu/utils"

describe("scoped world queries", () => {
	it("should optimize basic scoped query", async ({ expect }) => {
		const code = unindent`
			import type { World } from "@rbxts/jecs"
			import { A, B } from "./ecs"

			export function system({ world }: { world: World }) {
				for (const [e, a, b] of world.query(A, B)) {}
			}
		`
		const output = await compile(code)
		expect(output).toMatchSnapshot()
	})

	it("should optimize query with .with() modifier", async ({ expect }) => {
		const code = unindent`
			import type { World } from "@rbxts/jecs"
			import { A, B, C } from "./ecs"

			export function system({ world }: { world: World }) {
				for (const [id] of world.query(A, B).with(C)) {}
			}
		`
		const output = await compile(code)
		expect(output).toMatchSnapshot()
	})

	it("should optimize query with .without() modifier", async ({ expect }) => {
		const code = unindent`
			import type { World } from "@rbxts/jecs"
			import { A, C } from "./ecs"

			export function system({ world }: { world: World }) {
				for (const [id] of world.query(A).without(C)) {}
			}
		`
		const output = await compile(code)
		expect(output).toMatchSnapshot()
	})

	it("should optimize query with both modifiers", async ({ expect }) => {
		const code = unindent`
			import type { World } from "@rbxts/jecs"
			import { A, B, C } from "./ecs"

			export function system({ world }: { world: World }) {
				for (const [id] of world.query(A).with(B).without(C)) {}
			}
		`
		const output = await compile(code)
		expect(output).toMatchSnapshot()
	})

	it("should handle nested queries", async ({ expect }) => {
		const code = unindent`
			import type { World } from "@rbxts/jecs"
			import { A, B, C } from "./ecs"

			export function system({ world }: { world: World }) {
				for (const [e1] of world.query(A, B, C)) {
					for (const [e2] of world.query(A, B)) {}
				}
			}
		`
		const output = await compile(code)
		expect(output).toMatchSnapshot()
	})

	it("should handle break statements", async ({ expect }) => {
		const code = unindent`
			import type { World } from "@rbxts/jecs"
			import { A, B } from "./ecs"

			export function system({ world }: { world: World }) {
				for (const [e, a, b] of world.query(A, B)) {
					if (math.random() > 0.5) break
				}
			}
		`
		const output = await compile(code)
		expect(output).toMatchSnapshot()
	})

	it("should add world invalidation checks", async ({ expect }) => {
		const code = unindent`
			import type { World } from "@rbxts/jecs"
			import { A, B, C } from "./ecs"

			export function system({ world }: { world: World }) {
				for (const [e1] of world.query(A, B, C)) {
					for (const [e2] of world.query(A, B)) {}
				}
			}
		`
		const output = await compile(code)
		expect(output).toMatchSnapshot()
	})

	it("should handle direct world parameter", async ({ expect }) => {
		const code = unindent`
			import type { World } from "@rbxts/jecs"
			import { A, B } from "./ecs"

			export function system(world: World) {
				for (const [e, a, b] of world.query(A, B)) {
					if (math.random() > 0.5) break
				}
			}
		`
		const output = await compile(code)
		expect(output).toMatchSnapshot()
	})
})

describe("non-transformable code", () => {
	it("should not transform code without jecs queries", async ({ expect }) => {
		const code = unindent`
			export function add(a: number, b: number) {
				return a + b
			}
		`
		const output = await compile(code)
		expect(output).toMatchSnapshot()
	})
})
