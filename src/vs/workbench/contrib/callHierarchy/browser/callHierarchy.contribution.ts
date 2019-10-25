/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { CallHierarchyProviderRegistry, CallHierarchyDirection, CallHierarchyModel } from 'vs/workbench/contrib/callHierarchy/browser/callHierarchy';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { CallHierarchyTreePeekWidget } from 'vs/workbench/contrib/callHierarchy/browser/callHierarchyPeek';
import { Event } from 'vs/base/common/event';
import { registerEditorContribution, registerEditorAction, EditorAction, registerEditorCommand, EditorCommand } from 'vs/editor/browser/editorExtensions';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IContextKeyService, RawContextKey, IContextKey, ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { PeekContext } from 'vs/editor/contrib/referenceSearch/peekViewWidget';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';

const _ctxHasCompletionItemProvider = new RawContextKey<boolean>('editorHasCallHierarchyProvider', false);
const _ctxCallHierarchyVisible = new RawContextKey<boolean>('callHierarchyVisible', false);

class CallHierarchyController implements IEditorContribution {

	static readonly Id = 'callHierarchy';

	static get(editor: ICodeEditor): CallHierarchyController {
		return editor.getContribution<CallHierarchyController>(CallHierarchyController.Id);
	}

	private static readonly _StorageDirection = 'callHierarchy/defaultDirection';

	private readonly _ctxHasProvider: IContextKey<boolean>;
	private readonly _ctxIsVisible: IContextKey<boolean>;
	private readonly _dispoables = new DisposableStore();
	private readonly _sessionDisposables = new DisposableStore();

	constructor(
		private readonly _editor: ICodeEditor,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IStorageService private readonly _storageService: IStorageService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		this._ctxIsVisible = _ctxCallHierarchyVisible.bindTo(this._contextKeyService);
		this._ctxHasProvider = _ctxHasCompletionItemProvider.bindTo(this._contextKeyService);
		this._dispoables.add(Event.any<any>(_editor.onDidChangeModel, _editor.onDidChangeModelLanguage, CallHierarchyProviderRegistry.onDidChange)(() => {
			this._ctxHasProvider.set(_editor.hasModel() && CallHierarchyProviderRegistry.has(_editor.getModel()));
		}));
		this._dispoables.add(this._sessionDisposables);
	}

	dispose(): void {
		this._ctxHasProvider.reset();
		this._ctxIsVisible.reset();
		this._dispoables.dispose();
	}

	async startCallHierarchy(): Promise<void> {
		this._sessionDisposables.clear();

		if (!this._editor.hasModel()) {
			return;
		}

		const document = this._editor.getModel();
		const position = this._editor.getPosition();
		if (!CallHierarchyProviderRegistry.has(document)) {
			return;
		}

		const direction = this._storageService.getNumber(CallHierarchyController._StorageDirection, StorageScope.GLOBAL, <number>CallHierarchyDirection.CallsFrom);

		Event.any<any>(this._editor.onDidChangeModel, this._editor.onDidChangeModelLanguage)(this.endCallHierarchy, this, this._sessionDisposables);
		const widget = this._instantiationService.createInstance(
			CallHierarchyTreePeekWidget,
			this._editor,
			position,
			direction
		);

		widget.showLoading();
		this._ctxIsVisible.set(true);

		const cts = new CancellationTokenSource();

		this._sessionDisposables.add(widget.onDidClose(() => {
			this.endCallHierarchy();
			this._storageService.store(CallHierarchyController._StorageDirection, widget.direction, StorageScope.GLOBAL);
		}));
		this._sessionDisposables.add({ dispose() { cts.dispose(true); } });
		this._sessionDisposables.add(widget);

		try {
			const model = await CallHierarchyModel.create(document, position, cts.token);
			if (cts.token.isCancellationRequested) {
				return; // nothing
			} else if (model) {
				this._sessionDisposables.add(model);
				widget.showModel(model);
			} else {
				widget.showMessage(localize('no.item', "No results"));
			}
		} catch (e) {
			widget.showMessage(localize('error', "Failed to show call hierarchy"));
			console.error(e);
		}
	}

	endCallHierarchy(): void {
		this._sessionDisposables.clear();
		this._ctxIsVisible.set(false);
		this._editor.focus();
	}
}

registerEditorContribution(CallHierarchyController.Id, CallHierarchyController);

registerEditorAction(class extends EditorAction {

	constructor() {
		super({
			id: 'editor.showCallHierarchy',
			label: localize('title', "Peek Call Hierarchy"),
			alias: 'Peek Call Hierarchy',
			menuOpts: {
				group: 'navigation',
				order: 1.48
			},
			kbOpts: {
				kbExpr: EditorContextKeys.editorTextFocus,
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.Shift + KeyMod.Alt + KeyCode.KEY_H
			},
			precondition: ContextKeyExpr.and(
				_ctxHasCompletionItemProvider,
				PeekContext.notInPeekEditor
			)
		});
	}

	async run(_accessor: ServicesAccessor, editor: ICodeEditor, args: any): Promise<void> {
		return CallHierarchyController.get(editor).startCallHierarchy();
	}
});


registerEditorCommand(new class extends EditorCommand {

	constructor() {
		super({
			id: 'editor.closeCallHierarchy',
			kbOpts: {
				weight: KeybindingWeight.WorkbenchContrib + 10,
				primary: KeyCode.Escape
			},
			precondition: ContextKeyExpr.and(
				_ctxCallHierarchyVisible,
				ContextKeyExpr.not('config.editor.stablePeek')
			)
		});
	}

	runEditorCommand(_accessor: ServicesAccessor, editor: ICodeEditor): void {
		return CallHierarchyController.get(editor).endCallHierarchy();
	}
});
