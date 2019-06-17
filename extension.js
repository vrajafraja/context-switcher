
const vscode = require('vscode');
const fs = require('fs');
const path = require('path')
const homedir = require('os').homedir();
const CONTEXTS_STATUS_BAR_ITEM_ICON = "$(file-submodule) ";

let contexts = null;
let openedEditors = {};
let contextNameToStore = null;
let contextsStatusBarItem = null;

function activate(context) {

    context.subscriptions.push(vscode.commands.registerCommand('extension.saveContext', () => saveContext()));
    context.subscriptions.push(vscode.commands.registerCommand('extension.loadContext', () => loadContext()));
    context.subscriptions.push(vscode.commands.registerCommand('extension.updateContext', () => updateContext()));
    context.subscriptions.push(vscode.commands.registerCommand('extension.deleteContext', () => deleteContext()));
    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(() => {
        if (contextNameToStore)
            nextEditor();
    }));
    contextsStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
    contextsStatusBarItem.tooltip = "Currently loaded context";
    contextsStatusBarItem.show();
}

function saveContext() {
    let options = {
        prompt: "Context name: ",
        placeHolder: "(ticket number, feature etc.)"
    };

    vscode.window.showInputBox(options).then(contextName => {
        contextNameToStore = contextName.trim();
        if (!contextNameToStore) {
            vscode.window.setStatusBarMessage('Empty context name!', 2000);
            return;
        }
        storeOpenedDocuments();
        updateContextsStatusBarItem(contextNameToStore);
    });
}

function loadContext() {
    wakeUpContexts();
    const options = {
        preserveFocus: true,
        preview: false,
        viewColumn: vscode.ViewColumn.One
    }
    let contextNames = Object.keys(contexts).filter((key) => key != 'fileName');
    vscode.window.showQuickPick(contextNames).then(contextName => {
        let editorsToOpen = contexts[contextName];
        if (editorsToOpen) {
            closeAllEditors().then(() => {
                editorsToOpen.map(tab => {
                    vscode.workspace.openTextDocument(tab).then(document => {
                        vscode.window.showTextDocument(document, options).then(() => { }, () => { });
                    });
                });
                updateContextsStatusBarItem(contextName);
            });
        }
    });
}

function closeAllEditors() {
    return vscode.commands.executeCommand('workbench.action.closeAllEditors');
}

function updateContextsStatusBarItem(contextName) {
    contextsStatusBarItem.text = !!contextName ? CONTEXTS_STATUS_BAR_ITEM_ICON + contextName : "";
}

function updateContext() {
    if (!!contextsStatusBarItem.text) {
        contextNameToStore = contextsStatusBarItem.text.substr(CONTEXTS_STATUS_BAR_ITEM_ICON.length);
        storeOpenedDocuments();
    } else {
        saveContext();
    }
}

function deleteContext() {
    wakeUpContexts();
    let contextNames = Object.keys(contexts).filter((key) => key != 'fileName');
    vscode.window.showQuickPick(contextNames).then(contextName => {
        if (contextName) {
            vscode.window.showQuickPick(['Yes', 'No']).then(answer => {
                if (answer === 'Yes') {
                    delete contexts[contextName];
                    storeToFile();
                    updateContextsStatusBarItem();
                }
            })
        }
    });
}

function storeOpenedDocuments() {
    openedEditors = {};
    nextEditor();
}

function nextEditor() {
    let editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.setStatusBarMessage('Nothing to store!', 2000);
        return;
    }
    let openEditor = vscode.window.activeTextEditor.document.fileName;
    if (openedEditors[openEditor] === undefined) {
        openedEditors[openEditor] = 'checked';
        vscode.commands.executeCommand('workbench.action.nextEditor');
        if (Object.keys(openedEditors).length == 1) {
            updateContexts();
        }
    } else {
        updateContexts();
        contextNameToStore = null;
        openedEditors = null;
    }
}

function updateContexts() {
    wakeUpContexts();
    let openedTextDocuments = vscode.workspace.textDocuments.filter(item => !item.isUntitled).map(item => item.fileName);
    let openedDocuments = Object.keys(openedEditors).filter(item => openedTextDocuments.includes(item));
    contexts[contextNameToStore] = openedDocuments;
    storeToFile();
}

function wakeUpContexts() {
    let contextsFileNameHasChanged = (contexts && (contexts.fileName != _getContextsName()));
    let firstStart = !contexts;
    let contextsIsEmpty = !(contexts && Object.keys(contexts).length >= 0);
    if (firstStart || contextsFileNameHasChanged || contextsIsEmpty) {
        let file;
        try {
            let filePath = getFilePath();
            file = fs.readFileSync(filePath);
            contexts = JSON.parse(file);
        } catch (err) {
            contexts = {};
        }
        if (contexts.fileName === undefined) {
            contexts.fileName = _getContextsName();
        }
    }
}

function getFilePath() {
    let contextsFileName = _getContextsName();
    let contextsFilePath = _getContextsFilePath();

    let filePath = path.normalize(contextsFilePath + '/' + contextsFileName + '.json');
    return filePath;
}

function storeToFile() {
    let filePath = getFilePath();
    contexts.fileName = _getContextsName();
    fs.writeFile(filePath, JSON.stringify(contexts), function (err) {
        if (err) {
            vscode.window.setStatusBarMessage('Contexts were not stored, error: ' + err, 30000);
        }
        vscode.window.setStatusBarMessage('Contexts file sucessfully updated!', 2000);
    });
}

function _getContextsConfiguration() {
    return vscode.workspace.getConfiguration('context-switcher');
}

function _getContextsName() {
    let configuration = _getContextsConfiguration();
    return configuration["file-name"] || "context-switcher-contexts";
}

function _getContextsFilePath() {
    let configuration = _getContextsConfiguration();
    return configuration["storage-path"] || homedir;
}

exports.activate = activate;
function deactivate() {
}
exports.deactivate = deactivate;