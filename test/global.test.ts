import { describe, it } from "vitest"
import { compile } from "./index.js"
import { toArray } from "../src/util.js"

const fileHeader = `
	import { World, pair } from "@rbxts/jecs"
	import { A, B, C, D, tbl, world } from "./ecs"
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
	"shouldn't cache a manually cached query": `
		for (const [,] of world.query(A, B).cached()) {}
	`,
	"shouldn't cache a manually cached query with modifiers": `
		for (const [,] of world.query(A).with(B).without(C).cached()) {}
	`,
	"should support table property access": `
		for (const [e, e2] of world.query(tbl.E)) {}
	`,
	"should support 2 independent queries": `
		for (const [e1] of world.query(A)) {}
		for (const [e2] of world.query(B)) {}
	`,
	"should support 2 independent queries with modifiers": `
		for (const [e1] of world.query(A).with(B)) {}
		for (const [e2] of world.query(B).without(C)) {}
	`,
	"should support 2 systems with the same query": [
		`
		for (const [e1] of world.query(A, B)) {}
		`,
		`
		for (const [e2] of world.query(A, B)) {}
		`,
	],
	"shouldn't cache a query that is used outside a loop": `
		const q = world.query(A, B)
		for (const [e, a] of q) {}
	`,
	"should traverse through declarations to inline": `
		const q1 = world.query(A, B)
		const q2 = q1.with(C)
		for (const [e, a] of q2) {}
	`,
	"should not crash when an invalid amount of components is used": `
		for (const [e, a, illegal] of world.query(A)) {
			const _ = illegal
		}
	`,
	"should support let destructuring": `
		for (let [e, a, b, illegal] of world.query(A, B)) {
			e = world.entity()
			a = ""
			b = 15
			illegal = ""
		}
	`,
}

describe("scoped world queries with destructuring parameter", () => {
	for (const [name, code] of Object.entries(sharedCases)) {
		it(name, async ({ expect }) => {
			const output = await compile(`
				${fileHeader}
				${toArray(code)
					.map((s, i) => `export function system${i}({ world }: { world: World }) { ${s} }`)
					.join("\n")}
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
				${toArray(code)
					.map(
						(s, i) => `export function system${i}(info: { world: World }) { const { world } = info; ${s} }`,
					)
					.join("\n")}
			`)
			expect(output).toMatchSnapshot()
		})
	}
})

describe("scoped world queries with property access", () => {
	for (const [name, code] of Object.entries(sharedCases)) {
		it(name, async ({ expect }) => {
			const output = await compile(`
				${fileHeader}
				${toArray(code)
					.map(
						(s, i) =>
							`export function system${i}(info: { world: World }) { ${s.replaceAll("world.", "info.world.")} }`,
					)
					.join("\n")}
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
				${toArray(code)
					.map((s, i) => `export function system${i}() { ${s} }`)
					.join("\n")}
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
