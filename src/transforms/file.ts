import ts from "typescript"
import type { TransformState } from "./index.js"
import { transformStatement } from "./statement/index.js"
import { toArray } from "../util.js"

export function transformFile(state: TransformState, file: ts.SourceFile): ts.SourceFile {
	state.loadJecsSymbols(file)

	const [statements, cache] = state.captureCache(file, () => {
		const statements = new Array<ts.Statement>()

		for (const stmt of file.statements) {
			const [newStatements, prereqs] = state.capture(() => transformStatement(state, stmt))

			statements.push(...prereqs)
			statements.push(...toArray(newStatements))
		}

		return statements
	})

	let insertIndex = 0
	for (const requires of cache.requires) {
		insertIndex = Math.max(insertIndex, statements.indexOf(requires) + 1)
	}

	return ts.factory.updateSourceFile(file, [
		...statements.slice(0, insertIndex),
		...cache.toOuterResults(),
		...statements.slice(insertIndex),
	])
}
