import { describe, it } from "vitest"
import { compile } from "./index.js"

const fileHeader = `
	import { World, pair } from "@rbxts/jecs"
	import { A, B, C, D, world } from "./ecs"
`

const sharedCases = {
	"should optimize basic scoped query": `
		for (const [e, a, b] of world.query(A, B)) {}
	`,
	"should optimize query with .with() modifier": `
		for (const [id] of world.query(A, B).with(C)) {}
	`,
	"should optimize query with .without() modifier": `
		for (const [id] of world.query(A).without(C)) {}
	`,
	"should optimize query with both modifiers": `
		for (const [id] of world.query(A).with(B).without(C)) {}
	`,
	"should handle nested queries": `
		for (const [e1] of world.query(A, B, C)) {
			for (const [e2] of world.query(A, B)) {}
		}
	`,
	"should handle break statements": `
		for (const [e, a, b] of world.query(A, B)) {
			if (math.random() > 0.5) break
		}
	`,
	"should handle nested break statements": `
		for (const [e1] of world.query(A, B, C)) {
			for (const [e2] of world.query(A, B)) {
				if (math.random() > 0.5) break
			}
			if (math.random() > 0.5) break
		}
	`,
	"should add world invalidation checks": `
		for (const [e1] of world.query(A, B, C)) {
			for (const [e2] of world.query(A, B)) {}
		}
	`,
	"should be able to use a component with an unnameable type": `
		for (const [e, d] of world.query(D)) {}
	`,
	"should be able to use pairs": `
		for (const [,] of world.query(pair(A, B))) {}
	`,
	"should not cache an opted-out query": `
		for (const [,] of /* no-cache */ world.query(A, B)) {}
	`,
	"should not cache a non-static query": `
		const comps = math.random() > 0.5 ? [A, B] : [B, C]
		for (const [,] of world.query(...comps)) {}
	`,
}

describe("scoped world queries with destructuring parameter", () => {
	for (const [name, code] of Object.entries(sharedCases)) {
		it(name, async ({ expect }) => {
			const output = await compile(`
				${fileHeader}
				export function system({ world }: { world: World }) {
					${code}
				}
			`)
			expect(output).toMatchSnapshot()
		})
	}
})

describe("scoped world queries with destructuring statement", () => {
	for (const [name, code] of Object.entries(sharedCases)) {
		it(name, async ({ expect }) => {
			const output = await compile(`
				${fileHeader}
				export function system(info: { world: World }) {
					const { world } = info
					${code}
				}
			`)
			expect(output).toMatchSnapshot()
		})
	}
})

describe("global world queries", () => {
	for (const [name, code] of Object.entries(sharedCases)) {
		it(name, async ({ expect }) => {
			const output = await compile(`
				${fileHeader}
				export function system() {
					${code}
				}
			`)
			expect(output).toMatchSnapshot()
		})
	}
})

describe("non-transformable code", () => {
	it("should not transform code without jecs queries", async ({ expect }) => {
		const code = `
			export function add(a: number, b: number) {
				return a + b
			}
		`
		const output = await compile(code)
		expect(output).toMatchSnapshot()
	})
})
