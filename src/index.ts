import ts from "typescript"
import { type Config, TransformState } from "./transforms/index.js"
import { transformFile } from "./transforms/file.js"

const transformer: (
	program: ts.Program,
	config?: Partial<Config> & { resolutionHost?: ts.ModuleResolutionHost },
) => ts.TransformerFactory<ts.SourceFile> = (program, config) => (context) => {
	const state = new TransformState(program, context, {
		jecsPackage: "@rbxts/jecs",
		silent: false,
		...(config ?? {}),
	})
	if (config?.resolutionHost) {
		state.resolutionHost = config.resolutionHost
	}
	return (sourceFile) => transformFile(state, sourceFile)
}
export default transformer
