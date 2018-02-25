
const vscode = require('vscode');
const fs = require('fs');
const path = require('path')
const homedir = require('os').homedir();

let contexts = null;
let openedDocuments = {};
let contextNameToStore = null;

function activate(context) {

    context.subscriptions.push(vscode.commands.registerCommand('extension.saveContext', () => saveContext()));
    context.subscriptions.push(vscode.commands.registerCommand('extension.loadContext', () => loadContext()));
    context.subscriptions.push(vscode.commands.registerCommand('extension.deleteContext', () => deleteContext()));
    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(() => {
        if (contextNameToStore)
            nextEditor();
    }));
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
    });
}

function loadContext() {
    wakeUpContexts();
    let contextNames = Object.keys(contexts);
    vscode.window.showQuickPick(contextNames).then(contextName => {
        let editorsToOpen = contexts[contextName];
        if (editorsToOpen) {
            closeAllEditors();
            editorsToOpen.map(tab => {
                vscode.workspace.openTextDocument(tab).then(document => {
                    vscode.window.showTextDocument(document).then(() => {}, () => {});
                });
            });
        }
    });
}

function closeAllEditors() {
    vscode.commands.executeCommand('workbench.action.closeAllEditors');
}

function deleteContext() {
    wakeUpContexts();
    let items = Object.keys(contexts);
    vscode.window.showQuickPick(items).then(contextName => {
        if (contextName) {
            vscode.window.showQuickPick(['Yes', 'No']).then(answer => {
                if (answer === 'Yes') {
                    delete contexts[contextName];
                    storeToFile();
                }
            })
        }
    });
}

function storeOpenedDocuments() {
    openedDocuments = {};
    nextEditor();
}

function nextEditor (){
    let editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.setStatusBarMessage('Nothing to store!', 2000);
        return;
    }
    let openEditor = vscode.window.activeTextEditor.document.fileName;
    if (openedDocuments[openEditor] === undefined) {
        openedDocuments[openEditor] = 'checked';
        vscode.commands.executeCommand('workbench.action.nextEditor');
        if (Object.keys(openedDocuments).length == 1) {
            updateContexts();
        }
    } else {
        updateContexts();
        contextNameToStore = null;
        openedDocuments = null;
    }
}

function updateContexts() {
    wakeUpContexts();
    let openedEditors = vscode.workspace.textDocuments.filter(item => !item.isUntitled).map(item => item.fileName);
    contexts[contextNameToStore] = openedEditors;
    storeToFile();
}

function wakeUpContexts() {
    if(!contexts) {
        let file;
        try {
            let filePath = getFilePath();
            file = fs.readFileSync(filePath);
        } catch (err) {
            contexts = {};
            return;
        }
        contexts = JSON.parse(file);
    }
}

function getFilePath() {
    let configuration = vscode.workspace.getConfiguration('context-switcher');
    let contextsFileName = configuration["file-name"] || "context-switcher-contexts";
    let contextsFilePath = configuration["storage-path"] || homedir;

    let filePath = path.normalize(contextsFilePath + '/' + contextsFileName + '.json');
    return filePath;
}

function storeToFile() {
    let filePath = getFilePath();
    fs.writeFile(filePath, JSON.stringify(contexts), function (err) {
        if (err) {
            vscode.window.setStatusBarMessage('Contexts were not stored, error: ' + err, 30000);
        }
        vscode.window.setStatusBarMessage('Contexts file sucessfully updated!', 2000);
      });
}

exports.activate = activate;
function deactivate() {
}
exports.deactivate = deactivate;