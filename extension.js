const vscode = require('vscode');
const fs = require('fs');
const path = require('path')
const homedir = require('os').homedir();
const rootDirectory = vscode.workspace.workspaceFolders;
const CONTEXTS_STATUS_BAR_ITEM_ICON = "$(file-submodule) ";
const gitExtension = vscode.extensions.getExtension('vscode.git').exports;
const gitAPI = gitExtension.getAPI(1);
const contextMeta = ['fileName'];

let contexts = null;
let openedEditors = {};
let contextNameToStore = null;
let contextsStatusBarItem = null;

function activate(context) {

    context.subscriptions.push(vscode.commands.registerCommand('extension.loadContextFromLegacyStorage', () => loadContextFromLegacyStorage()));
    context.subscriptions.push(vscode.commands.registerCommand('extension.saveContext', () => saveContext()));
    context.subscriptions.push(vscode.commands.registerCommand('extension.loadContext', () => loadContext()));
    context.subscriptions.push(vscode.commands.registerCommand('extension.loadContextFromGit', () => loadContextFromGit()));
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
    const options = {
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
    const contextNames = _getContextNames();
    vscode.window.showQuickPick(contextNames).then(contextName => {
        const editorsToOpen = contexts[contextName];
        if (editorsToOpen) {
            openEditors({ contextName, editorsToOpen });
        }
    });
}

function loadContextFromLegacyStorage() {
    wakeUpContexts({ migration: true });
    const contextNames = _getContextNames();
    vscode.window.showQuickPick(contextNames).then(contextName => {
        const editorsToOpen = contexts[contextName];
        if (editorsToOpen) {
            openEditors({ contextName, editorsToOpen, migration: true }).then(() => updateContext());
        }
    });
}

function openEditors({ contextName, editorsToOpen, migration } = { migration: false }) {
    const options = {
        preserveFocus: false,
        preview: false,
        viewColumn: vscode.ViewColumn.One
    }
    const rootDirectory = _getRootDirectory();
    return closeAllEditors().then(() => {
        editorsToOpen.map(fileUrl => {
            if (migration) {
                vscode.workspace.openTextDocument(fileUrl).then(document => {
                    vscode.window.showTextDocument(document, options).then(() => { }, () => { });
                }).catch(err => {
                    console.log(`Error while opening file: ${fileUrl} ${err}`);
                });
            } else {
                vscode.workspace.openTextDocument(path.normalize(`${rootDirectory}${fileUrl}`)).then(document => {
                    vscode.window.showTextDocument(document, options).then(() => { }, () => { });
                }).catch(err => {
                    console.log(`Error while opening file: ${fileUrl} ${err}`);
                });
            }

        });
        updateContextsStatusBarItem(contextName);
    });
}

function loadContextFromGit() {
    wakeUpContexts();
    const repositories = getGitRepositoriesName();
    vscode.window.showQuickPick(repositories).then(repositoryName => {
        const repository = getGitRepositoryByName(repositoryName);
        repository.getCommit(repository.state.HEAD.commit).then(commit => {
            repository.diffWith(commit.parents[0]).then(change => {
                const changedFiles = change.map(file => file.uri.path);
                openEditors(repositoryName, changedFiles);
            });
        });
    });
}

function getGitRepositoriesName() {
    return gitAPI.repositories.map(repository => repository.rootUri.path.split('/').pop());
}

function getGitRepositoryByName(name) {
    return gitAPI.repositories.filter(repository => repository.rootUri.path.split('/').pop() === name)[0];
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
    const contextNames = _getContextNames();
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
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.setStatusBarMessage('Nothing to store!', 2000);
        return;
    }
    const openEditor = vscode.window.activeTextEditor.document.fileName;
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
    const openedTextDocuments = vscode.workspace.textDocuments.filter(item => !item.isUntitled).map(item => item.fileName);
    const openedDocuments = Object.keys(openedEditors).filter(item => openedTextDocuments.includes(item));
    const rootDirectory = _getRootDirectory();
    contexts[contextNameToStore] = openedDocuments.map(fileUri => fileUri.replace(rootDirectory, ''));
    storeToFile();
}

function wakeUpContexts({ migration } = { migration: false }) {
    const contextsFileNameHasChanged = (contexts && (contexts.fileName != _getContextsName()));
    const firstStart = !contexts || migration;
    const contextsIsEmpty = !(contexts && Object.keys(contexts).length >= 0);
    if (firstStart || contextsFileNameHasChanged || contextsIsEmpty) {
        try {
            const file = fs.readFileSync(getFilePath(migration));
            contexts = JSON.parse(file);
        } catch (err) {
            contexts = {};
        }
        if (contexts.fileName === undefined) {
            contexts.fileName = _getContextsName();
        }
    }
}

function getFilePath(migration) {
    const contextsFileName = _getContextsName(migration);
    const contextsFilePath = _getContextsFilePath(migration);
    const filePath = path.normalize(`${contextsFilePath}/${contextsFileName}.json`);
    return filePath;
}

function storeToFile() {
    contexts.fileName = _getContextsName();
    fs.mkdirSync(_getContextsFilePath(), { recursive: true });
    fs.writeFile(getFilePath(), JSON.stringify(contexts), function (err) {
        if (err) {
            vscode.window.setStatusBarMessage('Contexts were not stored, error: ' + err, 30000);
        }
        vscode.window.setStatusBarMessage('Contexts file sucessfully updated!', 2000);
    });
}

function _getContextNames() {
    return Object.keys(contexts).filter((key) => !contextMeta.includes(key));
}

function _getContextsConfiguration() {
    return vscode.workspace.getConfiguration('context-switcher');
}

function _getContextsName(migration) {
    if (migration) {
        let configuration = _getContextsConfiguration();
        return configuration["file-name"] || "context-switcher-contexts";
    }
    return "context-switcher";
}

function _getContextsFilePath(migration) {
    if (migration) {
        const configuration = _getContextsConfiguration();
        return configuration["storage-path"] || homedir;
    } else return path.normalize(`${_getRootDirectory()}/.vscode/`);
}

function _getRootDirectory() {
    if (rootDirectory && rootDirectory[0]) {
        return `${rootDirectory[0].uri.path}`.replace(rootDirectory[0].name, '');
    }
}

exports.activate = activate;
function deactivate() { }
exports.deactivate = deactivate;