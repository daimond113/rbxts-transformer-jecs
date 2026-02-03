import ts from "typescript"
import type { TransformState } from "../index.js"
import { toArray } from "../../util.js"

const TRANSFORMERS = new Map<
	ts.SyntaxKind,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(state: TransformState, node: any) => ts.Statement | ts.Statement[] | undefined
>([])

export function transformStatement(state: TransformState, statement: ts.Statement): ts.Statement | ts.Statement[] {
	const [node, prereqs] = state.capture(
		() => TRANSFORMERS.get(statement.kind)?.(state, statement) ?? state.transform(statement),
	)

	return [...prereqs, ...toArray(node)]
}
