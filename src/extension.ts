// Original script was GPT4 but it has been deeply Ship of Theseused. 

import * as vscode from "vscode";
import axios from "axios";
import * as cp from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { promisify } from "util";

let VSConfig: vscode.WorkspaceConfiguration;
let statusBarItem: vscode.StatusBarItem | undefined;
let apiEndpoint: string;
let apiBearerToken: string;
let apiModel: string;
let apiMessageHeader: string;
let apiTemperature: number;
let numPredict: number;
let promptWindowSize: number;
let completionKeys: string;
let responsePreview: boolean | undefined;
let responsePreviewMaxTokens: number;
let responsePreviewDelay: number;
let continueInline: boolean | undefined;
let customPrompt: string;
let contextMemoryEnabled: boolean;
let contextFileExtensions: string;

async function getOllamaModels(): Promise<string[]> {
	try {
		const response = await axios.get("http://localhost:11434/api/tags");
		return response.data.models.map((m: any) => m.name);
	} catch (error: any) {
		vscode.window.showErrorMessage(`Failed to fetch Ollama models: ${error.message}`);
		return [];
	}
}

async function getRunningModel(): Promise<string | null> {
	try {
		const response = await axios.get("http://localhost:11434/api/ps");
		const models = response.data.models;
		if (models && models.length > 0) {
			return models[0].name;
		}
		return null;
	} catch {
		return null;
	}
}

async function stopModel(modelName: string): Promise<boolean> {
	try {
		await axios.post("http://localhost:11434/api/generate", {
			model: modelName,
			prompt: "",
			stream: false,
			options: { num_predict: 0 }  // 0 tokens = stop model
		});
		return true;
	} catch {
		// Try alternative method
		try {
			await axios.delete(`http://localhost:11434/api/delete/${modelName}`);
			return true;
		} catch {
			return false;
		}
	}
}

// Helper function to ensure the selected model is running
async function ensureModelRunning(targetModel: string, showProgress: boolean = true): Promise<boolean> {
	console.log(`[OllamaAutocoder] ensureModelRunning - target: ${targetModel}`);
	const runningModel = await getRunningModel();
	console.log(`[OllamaAutocoder] ensureModelRunning - running: ${runningModel}`);
	
	// If the target model is already running, do nothing
	if (runningModel === targetModel) {
		console.log(`[OllamaAutocoder] Model ${targetModel} is already running`);
		return true;
	}
	
	// Stop the current running model if any
	if (runningModel) {
		console.log(`[OllamaAutocoder] Stopping model: ${runningModel}`);
		if (showProgress) {
			vscode.window.showInformationMessage(`Stopping ${runningModel}...`);
		}
		const execAsync = promisify(cp.exec);
		try {
			await execAsync(`ollama stop ${runningModel}`);
			console.log(`[OllamaAutocoder] Stopped model: ${runningModel}`);
		} catch (stopErr: any) {
			console.log(`[OllamaAutocoder] Stop warning: ${stopErr.message}`);
		}
		// Wait for model to fully unload
		await new Promise(resolve => setTimeout(resolve, 2000));
	}
	
	// Load the target model
	if (showProgress) {
		vscode.window.showInformationMessage(`Loading ${targetModel}...`);
	}
	try {
		const response = await axios.post(apiEndpoint, {
			model: targetModel,
			prompt: 'test',
			stream: false,
			options: { num_predict: 1 }
		}, { timeout: 60000 });
		console.log(`[OllamaAutocoder] Loaded model: ${targetModel}, response:`, response.data);
		return true;
	} catch (err: any) {
		console.error(`[OllamaAutocoder] Failed to load model: ${err.message}`);
		if (err.response && err.response.data && err.response.data.error) {
			console.error(`[OllamaAutocoder] Error details: ${err.response.data.error}`);
		}
		return false;
	}
}

// Context memory functions
function getContextFilePath(document: vscode.TextDocument): string | null {
	if (!contextMemoryEnabled) return null;
	
	const ext = path.extname(document.fileName).toLowerCase().replace('.', '');
	const enabledExts = contextFileExtensions.split(',').map(e => e.trim().toLowerCase().replace('.', ''));
	
	if (!enabledExts.includes(ext)) return null;
	
	const contextDir = path.join(os.tmpdir(), 'ollama-autocoder-context');
	if (!fs.existsSync(contextDir)) {
		fs.mkdirSync(contextDir, { recursive: true });
	}
	
	return path.join(contextDir, `context_${document.fileName.replace(/[\\/:*?"<>|]/g, '_')}.txt`);
}

function getContext(document: vscode.TextDocument): string {
	const contextPath = getContextFilePath(document);
	if (!contextPath || !fs.existsSync(contextPath)) return '';
	return fs.readFileSync(contextPath, 'utf8');
}

function saveContext(document: vscode.TextDocument, context: string) {
	const contextPath = getContextFilePath(document);
	if (!contextPath) return;
	fs.writeFileSync(contextPath, context, 'utf8');
}

function clearContext(document: vscode.TextDocument) {
	const contextPath = getContextFilePath(document);
	if (contextPath && fs.existsSync(contextPath)) {
		fs.unlinkSync(contextPath);
		console.log(`[OllamaAutocoder Debug] Context cleared for ${document.fileName}`);
	}
}

function updateStatusBar() {
	const item = statusBarItem;
	if (!item) return;
	
	// Get the currently running model
	getRunningModel().then(runningModel => {
		if (!statusBarItem) return;
		const displayModel = runningModel || apiModel;
		const statusText = runningModel ? `(Running)` : `(Not running)`;
		statusBarItem.text = `\$(symbol-model) ${displayModel}`;
		statusBarItem.command = "ollama-autocoder.selectModel";
		statusBarItem.tooltip = `Current: ${displayModel}\nStatus: ${statusText}\nClick to select Ollama model`;
		statusBarItem.show();
	}).catch(() => {
		if (!statusBarItem) return;
		// Fallback to configured model
		statusBarItem.text = `\$(symbol-model) ${apiModel}`;
		statusBarItem.command = "ollama-autocoder.selectModel";
		statusBarItem.tooltip = "Click to select Ollama model";
		statusBarItem.show();
	});
}

// Auto-update status bar every 5 seconds to keep in sync with running model
let statusBarUpdateInterval: NodeJS.Timeout | undefined;

function startStatusBarSync() {
	if (statusBarUpdateInterval) {
		clearInterval(statusBarUpdateInterval);
	}
	statusBarUpdateInterval = setInterval(() => {
		updateStatusBar();
	}, 5000);
}

function updateVSConfig() {
	VSConfig = vscode.workspace.getConfiguration("ollama-autocoder");
	apiEndpoint = VSConfig.get("endpoint") || "";
	apiModel = VSConfig.get("model") || "";
	apiMessageHeader = VSConfig.get("message header") || "";
	numPredict = VSConfig.get("max tokens predicted") || 0;
	promptWindowSize = VSConfig.get("prompt window size") || 0;
	completionKeys = VSConfig.get("completion keys") || " ";
	responsePreview = VSConfig.get("response preview");
	responsePreviewMaxTokens = VSConfig.get("preview max tokens") || 0;
	responsePreviewDelay = VSConfig.get("preview delay") || 0;
	continueInline = VSConfig.get("continue inline");
	apiTemperature = VSConfig.get("temperature") || 0;
	customPrompt = VSConfig.get("custom prompt") || "";
	contextMemoryEnabled = VSConfig.get("context memory") || false;
	contextFileExtensions = VSConfig.get("context file extension") || "txt,md";
	updateStatusBar();
}

updateVSConfig();

// No need for restart for any of these settings
vscode.workspace.onDidChangeConfiguration(updateVSConfig);

// Give model additional information
function messageHeaderSub(document: vscode.TextDocument) {
	const lang = document.languageId;
	let header = apiMessageHeader;
	if (lang === 'csharp') {
		header = VSConfig.get("csharpHeader") || header;
	}
	const sub = header
		.replace("{LANG}", lang)
		.replace("{FILE_NAME}", document.fileName)
		.replace("{PROJECT_NAME}", vscode.workspace.name || "Untitled");
	console.log(`[OllamaAutocoder Debug] Lang: ${lang}, Header preview: ${sub.substring(0, 100)}...`);
	return sub;
}

async function handleError(err: any) {
	if (err.code === 'ERR_CANCELED') return;

	let error_reason = err.code ? err.code.toString() : "";
	if (err.code === 'ECONNREFUSED') error_reason = "ECONNREFUSED — Ollama is likely not running";
	if (err.code === 'ERR_BAD_REQUEST') error_reason = "ERR_BAD_REQUEST — Settings are likely misconfigured"

	let error_response = err.message;

	// Show an error message
	vscode.window.showErrorMessage(
		"Ollama Autocoder encountered an error: " + error_reason + (error_response != "" ? ": " : "") +
		error_response);
	console.error(err);
}

// internal function for autocomplete, not directly exposed
async function autocompleteCommand(textEditor: vscode.TextEditor, cancellationToken?: vscode.CancellationToken) {
	const document = textEditor.document;
	const position = textEditor.selection.active;

	// Get the current prompt
	let prompt = document.getText(new vscode.Range(document.lineAt(0).range.start, position));
	prompt = prompt.substring(Math.max(0, prompt.length - promptWindowSize), prompt.length);

	// Show a progress message
	vscode.window.withProgress(
		{
			location: vscode.ProgressLocation.Notification,
			title: "Ollama Autocoder",
			cancellable: true,
		},
		async (progress, progressCancellationToken) => {
			try {
				progress.report({ message: "Checking model..." });

				// Ensure the configured model is running
				const runningModel = await getRunningModel();
				if (runningModel !== apiModel) {
					progress.report({ message: `Switching to ${apiModel}...` });
					const success = await ensureModelRunning(apiModel, false);
					if (!success) {
						vscode.window.showErrorMessage(`Failed to load model ${apiModel}`);
						return;
					}
				}

				progress.report({ message: "Starting model..." });

				let axiosCancelPost: () => void;
				const axiosCancelToken = new axios.CancelToken((c) => {
					const cancelPost = function () {
						c("Autocompletion request terminated by user cancel");
					};
					axiosCancelPost = cancelPost;
					if (cancellationToken) cancellationToken.onCancellationRequested(cancelPost);
					progressCancellationToken.onCancellationRequested(cancelPost);
					vscode.workspace.onDidCloseTextDocument(cancelPost);
				});

				// Add custom prompt if set
				let header = messageHeaderSub(textEditor.document);
				if (customPrompt) {
					header = customPrompt + "\n\n" + header;
				}
				
				// Add context memory if enabled
				let context = "";
				if (contextMemoryEnabled) {
					context = getContext(document);
				}
				
				const completeInput = header + (context ? context + "\n\n" : "") + prompt;
				console.log(`[OllamaAutocoder Debug] autocompleteCommand - model: ${apiModel}, prompt length: ${prompt.length}, completeInput length: ${completeInput.length}, num_predict: ${numPredict}, context: ${context ? 'enabled' : 'disabled'}`);

				// Make a request to the ollama.ai REST API
				const response = await axios.post(apiEndpoint, {
					model: apiModel, // Set via settings or "Ollama Autocoder: Select Ollama Model" command
					prompt: completeInput,
					stream: true,
					raw: true,
					options: {
						num_predict: numPredict,
						temperature: apiTemperature,
						stop: ["```"],
						num_ctx: Math.min(completeInput.length, promptWindowSize) // Assumes absolute worst case of 1 char = 1 token
					}
				}, {
					cancelToken: axiosCancelToken,
					responseType: 'stream',
					headers: {
						Authorization: apiBearerToken !== "" ? "Bearer " + apiBearerToken : undefined
					}
				}
				);

				//tracker
				let currentPosition = position;

				response.data.on('data', async (d: Uint8Array) => {
					progress.report({ message: "Generating..." });

					// Check for user input (cancel)
					if (currentPosition.line != textEditor.selection.end.line || currentPosition.character != textEditor.selection.end.character) {
						axiosCancelPost(); // cancel axios => cancel finished promise => close notification
						return;
					}

					try {
						// Get a completion from the response
						const completion: string = JSON.parse(d.toString()).response;
						console.log(`[OllamaAutocoder Debug] Chunk received: ${completion.length > 50 ? completion.substring(0, 50) + '...' : completion}`);
						// lastToken = completion;

						if (completion === "") {
							return;
						}

						//complete edit for token
						const edit = new vscode.WorkspaceEdit();
						edit.insert(document.uri, currentPosition, completion);
						await vscode.workspace.applyEdit(edit);

						// Move the cursor to the end of the completion
						const completionLines = completion.split("\n");
						const newPosition = new vscode.Position(
							currentPosition.line + completionLines.length - 1,
							(completionLines.length > 1 ? 0 : currentPosition.character) + completionLines[completionLines.length - 1].length
						);
						const newSelection = new vscode.Selection(
							position,
							newPosition
						);
						currentPosition = newPosition;

						// completion bar
						progress.report({ message: "Generating...", increment: 1 / (numPredict / 100) });

						// move cursor
						textEditor.selection = newSelection;
					} catch (parseErr) {
						console.log(`[OllamaAutocoder Debug] Parse error on chunk: ${d.toString().substring(0, 100)}`);
					}
				});

				// Keep cancel window available
				const finished = new Promise((resolve) => {
					response.data.on('end', () => {
						progress.report({ message: "Ollama completion finished." });
						resolve(true);
					});
					axiosCancelToken.promise.finally(() => { // prevent notification from freezing on user input cancel
						resolve(false);
					});
				});

				await finished;

			} catch (err: any) {
				if (err.response && err.response.data) err.response.data.on('data', async (d: Uint8Array) => {
					const completion: string = JSON.parse(d.toString()).error;
					err.message = completion;
					handleError(err);
				}).catch(handleError);
				else handleError(err);
			}
		}
	);
}

// Completion item provider callback for activate
async function provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, cancellationToken: vscode.CancellationToken) {

	// Create a completion item
	const item = new vscode.CompletionItem("Autocomplete with Ollama");

	// Set the insert text to a placeholder
	item.insertText = new vscode.SnippetString('${1:}');

	// Wait before initializing Ollama to reduce compute usage
	if (responsePreview) await new Promise(resolve => setTimeout(resolve, responsePreviewDelay * 1000));
	if (cancellationToken.isCancellationRequested) {
		return [item];
	}

	// Set the label & inset text to a shortened, non-stream response
	if (responsePreview) {
		try {
			// Ensure the configured model is running
			const runningModel = await getRunningModel();
			if (runningModel !== apiModel) {
				const success = await ensureModelRunning(apiModel, false);
				if (!success) {
					vscode.window.showErrorMessage(`Failed to load model ${apiModel}`);
					return [item];
				}
			}

			let prompt = document.getText(new vscode.Range(document.lineAt(0).range.start, position));
			prompt = prompt.substring(Math.max(0, prompt.length - promptWindowSize), prompt.length);
			
			// Add custom prompt if set
			let header = messageHeaderSub(document);
			if (customPrompt) {
				header = customPrompt + "\n\n" + header;
			}
			
			// Add context memory if enabled
			let context = "";
			if (contextMemoryEnabled) {
				context = getContext(document);
			}
			
			const completeInput = header + (context ? context + "\n\n" : "") + prompt;
			
			console.log(`[OllamaAutocoder Debug] provideCompletionItems - prompt length: ${prompt.length}, completeInput length: ${completeInput.length}, preview max tokens: ${responsePreviewMaxTokens}, context: ${context ? 'enabled' : 'disabled'}`);

			const response_preview = await axios.post(apiEndpoint, {
				model: apiModel, // Set via settings or "Ollama Autocoder: Select Ollama Model" command
				prompt: completeInput,
				stream: false,
				raw: true,
				options: {
					num_predict: responsePreviewMaxTokens, // reduced compute max
					temperature: apiTemperature
				}
			}, {
				cancelToken: new axios.CancelToken((c) => {
					const cancelPost = function () {
						c("Autocompletion request terminated by completion cancel");
					};
					cancellationToken.onCancellationRequested(cancelPost);
				}),
				headers: {
					Authorization: apiBearerToken !== "" ? "Bearer " + apiBearerToken : undefined
				}
			});

			if (response_preview.data.response.trim() != "") { // default if empty
				const responseText = response_preview.data.response.trimStart();
				item.label = responseText;
				item.insertText = new vscode.SnippetString(responseText);
			}
		} catch (err: any) {
			if (err.response && err.response.data) err.message = err.response.data.error;
			handleError(err);
		}
	}

	// Set the documentation to a message
	item.documentation = new vscode.MarkdownString('Press `Enter` to get an autocompletion from Ollama');
	// Set the command to trigger the completion
	if (continueInline || !responsePreview) item.command = {
		command: 'ollama-autocoder.autocomplete',
		title: 'Autocomplete with Ollama',
		arguments: [cancellationToken]
	};
	// Return the completion item
	return [item];
}

// This method is called when extension is activated
function activate(context: vscode.ExtensionContext) {
	// Register a completion provider for JavaScript files
	const completionProvider = vscode.languages.registerCompletionItemProvider("*", {
		provideCompletionItems
	},
		...completionKeys.split("")
	);

	// Bearer token secret handling
	context.secrets.get("apiBearerToken").then(value => {
		apiBearerToken = value || ""
	})

	const bearerSetChangeEvent = context.secrets.onDidChange((event) => {
		if (event.key === "apiBearerToken") {
			context.secrets.get("apiBearerToken").then(value => {
				apiBearerToken = value || ""
			})
		}
	})

	const externalSetBearerCommand = vscode.commands.registerCommand(
		"ollama-autocoder.setBearerToken",
		async () => {
			const tokenInput: string | undefined = await vscode.window.showInputBox({
				password: true,
				title: "Set API bearer token",
				prompt: "Enter your API key or the username followed by the password, depending on which reverse proxy you are using. If you would like to remove the authorization header, type [SPACE] and submit."
			});

			if (tokenInput && tokenInput.trim() !== "") {
				context.secrets.store("apiBearerToken", tokenInput);
			} else if (tokenInput) {
				context.secrets.delete("apiBearerToken");
			}
		}
	)

	// Register command for setting custom prompt
	const setCustomPromptCommand = vscode.commands.registerCommand(
		"ollama-autocoder.setCustomPrompt",
		async () => {
			const currentPrompt = customPrompt || "";
			
			// Show current prompt info if exists
			if (currentPrompt) {
				const action = await vscode.window.showInformationMessage(
					`Current custom prompt: ${currentPrompt.substring(0, 50)}${currentPrompt.length > 50 ? '...' : ''}`,
					{ modal: true },
					"Modify",
					"Clear",
					"Cancel"
				);
				
				if (action === "Clear") {
					await VSConfig.update("custom prompt", "", vscode.ConfigurationTarget.Global);
					updateVSConfig();
					vscode.window.showInformationMessage(`✅ Custom prompt cleared`);
					return;
				}
				
				if (action === "Cancel" || action === undefined) {
					return;
				}
			}
			
			const promptInput: string | undefined = await vscode.window.showInputBox({
				password: false,
				title: "Set Custom Prompt",
				prompt: "Enter a custom prompt that will be prepended to all requests. Leave empty to disable.",
				value: currentPrompt
			});

			if (promptInput !== undefined) {
				await VSConfig.update("custom prompt", promptInput, vscode.ConfigurationTarget.Global);
				updateVSConfig();
				if (promptInput) {
					vscode.window.showInformationMessage(`✅ Custom prompt updated`);
				} else {
					vscode.window.showInformationMessage(`✅ Custom prompt cleared`);
				}
			}
		}
	)

	// Register a command for getting a completion from Ollama through command/keybind
	const externalAutocompleteCommand = vscode.commands.registerTextEditorCommand(
		"ollama-autocoder.autocomplete",
		(textEditor, _, cancellationToken?) => {
			// no cancellation token from here, but there is one from completionProvider
			autocompleteCommand(textEditor, cancellationToken);
		}
	);

	// Define selectModelCommand before try block
		const selectModelCommand = vscode.commands.registerCommand(
			"ollama-autocoder.selectModel",
			async () => {
				const models = await getOllamaModels();
				if (models.length === 0) {
					vscode.window.showErrorMessage("No Ollama models found. Ensure Ollama is running and try again.");
					return;
				}
				const selected = await vscode.window.showQuickPick(models, {
					placeHolder: "Select an Ollama model to switch to"
				});
				if (selected) {
					// Refresh config to get latest value
					updateVSConfig();
					
					console.log(`[OllamaAutocoder] Select model - apiModel: "${apiModel}", selected: "${selected}"`);
					
					// Check if selected model matches the configured model
					if (apiModel === selected) {
						// Still need to ensure it's running
						const runningModel = await getRunningModel();
						if (runningModel === selected) {
							vscode.window.showInformationMessage(`✅ ${selected} is already selected and running`);
							return;
						}
						// Model in config but not running, start it
						vscode.window.showInformationMessage(`Starting ${selected}...`);
						const success = await ensureModelRunning(selected, true);
						if (success) {
							vscode.window.showInformationMessage(`✅ ${selected} is now running`);
						} else {
							vscode.window.showErrorMessage(`Failed to start ${selected}`);
						}
						return;
					}

					// Update to global config first
					await VSConfig.update("model", selected, vscode.ConfigurationTarget.Global);
					console.log(`[OllamaAutocoder] Config updated to ${selected}`);
					
					// Ensure the model is running (stop old, load new)
					const success = await ensureModelRunning(selected, true);
					
					if (success) {
						vscode.window.showInformationMessage(`✅ Switched to ${selected}`);
					} else {
						vscode.window.showErrorMessage(`❌ Failed to switch to ${selected}`);
					}
					updateVSConfig();
				}
			}
		);

	// Add the commands & completion provider to the context
		try {
			context.subscriptions.push(completionProvider);
			context.subscriptions.push(externalAutocompleteCommand);
			context.subscriptions.push(externalSetBearerCommand);
			context.subscriptions.push(setCustomPromptCommand);
			context.subscriptions.push(selectModelCommand);

			statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, -10000);
			context.subscriptions.push(statusBarItem);

		updateStatusBar();
		startStatusBarSync();
		} catch (err) {
			handleError(err);
		}

	// Register document close handler for context memory cleanup
	if (contextMemoryEnabled) {
		const closeHandler = vscode.workspace.onDidCloseTextDocument((doc) => {
			clearContext(doc);
		});
		context.subscriptions.push(closeHandler);
	}

	context.subscriptions.push(bearerSetChangeEvent);
}

function deactivate() { }

module.exports = {
	activate,
	deactivate,
};

