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

	// Only return array when there are prereqs, otherwise return single node
	// to avoid breaking visitEachChild which expects single nodes
	if (prereqs.length === 0 && !Array.isArray(node)) {
		return node
	}
	return [...prereqs, ...toArray(node)]
}
