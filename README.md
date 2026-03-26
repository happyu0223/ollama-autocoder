# Ollama Happy Autocoder 中文使用说明

一个简单易用的 Ollama 自动补全引擎，支持暴露选项和流式功能。

![示例](example.gif)

## 需求 (Requirements)

- Ollama 必须在设置中指定的 API 端点上运行服务。
  - Ollama 安装请访问 [ollama.ai](https://ollama.ai)
- Ollama 必须安装设置中指定的 \`model\`。当前默认是 \`qwen2.5-coder:7b\`。
- \`prompt window size\`（提示窗口大小）应与模型的最大上下文窗口对齐。

## 配置 (Configuration)

在 VS Code 设置 (Ctrl+,) 中搜索 "Ollama Autocoder" 配置以下选项：

| 配置项 | 默认值 | 描述 |
|--------|--------|------|
| \`ollama-autocoder.endpoint\` | \`http://localhost:11434/api/generate\` | Ollama REST API 端点 |
| \`ollama-autocoder.model\` | \`qwen2.5-coder:7b\` | 模型名称（如 qwen2.5-coder:7b）。使用命令 "Ollama Autocoder: Select Ollama Model" 动态选择。 |
| \`ollama-autocoder.temperature\` | \`0.4\` | 模型温度（推荐低于对话温度） |
| \`ollama-autocoder.max tokens predicted\` | \`1000\` | 模型生成的最大 token 数 |
| \`ollama-autocoder.prompt window size\` | \`131072\` | 提示字符大小（非 token，建议 1.3-4x 模型最大 token） |
| \`ollama-autocoder.completion keys\` | \` \`(空格) | 触发自动补全的字符（多字符需重载窗口） |
| \`ollama-autocoder.response preview\` | \`true\` | 内联预览第一行响应（慢设备建议禁用） |
| \`ollama-autocoder.preview max tokens\` | \`50\` | 预览最大 token（建议低值） |
| \`ollama-autocoder.preview delay\` | \`1\` | 预览延迟秒数（非电池设备设为 0） |
| \`ollama-autocoder.continue inline\` | \`true\` | 预览后继续内联生成 |
| \`ollama-autocoder.message header\` | （伪系统提示模板） | 代码补全优化提示模板 |

其他命令：
- \`Ollama Autocoder: Set Ollama API Bearer Token\`：设置反向代理认证令牌。

## 如何使用 (How to Use)

1. **触发自动补全**：
   - 在文本文档中，按 **空格**（或 \`completion keys\` 设置中的任意字符）。
   - 出现 \`Autocomplete with Ollama\` 选项或第一行预览，按 **Enter** 开始生成。
   - 或者通过命令面板运行 **"Autocomplete with Ollama"**（可绑定快捷键）。

2. **生成过程**：
   - 生成启动后，token 将**流式**插入光标位置。
   - **提前停止**：点击 "Ollama Autocoder" 通知中的 **"Cancel"** 按钮，或输入内容中断。

3. **停止**：生成结束时，通知自动消失。

**使用提示**：
- **按空格激活，Enter 写入代码**。

## 注意事项 (Notes)

- **最佳性能**：推荐 NVIDIA GPU 或 Apple Silicon。CPU 可用于小模型。
- **提示范围**：模型仅看到光标**后方**文本，前方文本不可见。
- **低端/电池设备**：
  - 禁用 \`response preview\`（将始终开启 \`continue inline\`）。
  - 增加 \`preview delay\`。
- **自定义**：若不喜欢内联继续，设 \`continue inline\` 为 \`false\`（命令面板仍支持多行）。
- **模型切换**：使用 "Select Ollama Model" 命令从本地 Ollama 列表动态选择。

## 故障排除 (Troubleshooting)

- **无响应**：检查 Ollama 是否运行、模型已安装、端点正确。
- **预览不响应**：设 \`preview delay\` 为 0 测试。
- **生成慢**：降低温度、max tokens，或使用 GPU。
- 问题反馈：https://github.com/10Nates/ollama-autocoder/issues

**文档版本**：基于 v0.1.1，包含动态模型切换功能。

