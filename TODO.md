# Ollama Model Dynamic Switching Task

## Steps:
- [x] 1. Update package.json: Add 'ollama-autocoder.selectModel' command and enhance model setting description.
- [x] 2. Update src/extension.ts: Add child_process imports, getOllamaModels function, selectModel command registration and handler with QuickPick.
- [x] 3. Compile the extension: npm run compile.
- [x] 4. Reload VSCode window and test: Run command 'Ollama Autocoder: Select Ollama Model', pick a model, verify autocomplete uses it.

**Task completed.**  

npm install 安装依赖
npm run compile  编译
vsce package  打包
