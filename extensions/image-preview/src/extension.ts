/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { PreviewManager } from './preview';
import { SizeStatusBarEntry } from './sizeStatusBarEntry';
import { ZoomStatusBarEntry } from './zoomStatusBarEntry';

export function activate(context: vscode.ExtensionContext) {
	const extensionRoot = vscode.Uri.file(context.extensionPath);

	const sizeStatusBarEntry = new SizeStatusBarEntry();
	context.subscriptions.push(sizeStatusBarEntry);

	const zoomStatusBarEntry = new ZoomStatusBarEntry();
	context.subscriptions.push(zoomStatusBarEntry);

	const previewManager = new PreviewManager(extensionRoot, sizeStatusBarEntry, zoomStatusBarEntry);

	context.subscriptions.push(vscode.window.registerWebviewEditorProvider(
		PreviewManager.viewType,
		{
			async resolveWebviewEditor(resource: vscode.Uri, editor: vscode.WebviewEditor): Promise<void> {
				previewManager.resolve(resource, editor);
			}
		}));

	context.subscriptions.push(vscode.commands.registerCommand('imagePreview.zoomIn', () => {
		previewManager.activePreview?.zoomIn();
	}));

	context.subscriptions.push(vscode.commands.registerCommand('imagePreview.zoomOut', () => {
		previewManager.activePreview?.zoomOut();
	}));
}

