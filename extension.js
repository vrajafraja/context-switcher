
const vscode = require('vscode');
const fs = require('fs');
const homedir = require('os').homedir();
const contextsFileName = 'vscode-contexts';
const filePath = homedir + '/' + contextsFileName + '.json';
let contexts = null;
let openedDocuments = {};
let contextNameToStore = null;

function activate(context) {

    context.subscriptions.push(vscode.commands.registerCommand('extension.saveContext', () => saveContext()));
    context.subscriptions.push(vscode.commands.registerCommand('extension.loadContext', () => loadContext()));
    context.subscriptions.push(vscode.commands.registerCommand('extension.deleteContext', () => deleteContext()));
    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(() => {
        if (contextNameToStore) 
            nextEditor.call();
    }));
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

function loadContext() {
    wakeUpContexts();
    let items = Object.keys(contexts);
    vscode.window.showQuickPick(items).then(contextName => {
        let tabsToOpen = contexts[contextName];
        if (tabsToOpen) {
            closeAllTabs();
            tabsToOpen.map(tab => {
                vscode.workspace.openTextDocument(tab).then(document => {
                    vscode.window.showTextDocument(document).then(() => {}, () => {});
                });
        });
        }
    });
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

function storeOpenedDocuments() {
    openedDocuments = {};
    nextEditor.call();
}

function updateContexts() {
    wakeUpContexts();
    let openedTabs = vscode.workspace.textDocuments.filter(item => !item.isUntitled).map(item => item.fileName);
    contexts[contextNameToStore] = openedTabs;
    storeToFile();
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
    }
}

function wakeUpContexts() {
    if(!contexts) {
        var file;
        try {
            file = fs.readFileSync(filePath);
        } catch (err) {
            contexts = {};
            return;
        }
        contexts = JSON.parse(file);
    }
}

function storeToFile() {
    fs.writeFile(filePath, JSON.stringify(contexts), function (err) {
        if (err) {
            throw err;
        }
        vscode.window.setStatusBarMessage('Contexts file sucessfully updated!', 2000);
      });
}

function closeAllTabs() {
    vscode.commands.executeCommand('workbench.action.closeAllEditors');
}

exports.activate = activate;
function deactivate() {
}
exports.deactivate = deactivate;