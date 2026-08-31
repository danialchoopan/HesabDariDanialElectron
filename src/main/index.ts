import { app, BrowserWindow, Menu, globalShortcut, dialog } from 'electron'
import { join } from 'path'
import { registerAllHandlers } from './ipc/handlers'
import { getDatabase, closeDatabase } from './database/connection'
import { readFileSync } from 'fs'
import { appendFileSync } from 'fs'
// import { seedDatabase } from './database/seed' // disabled
import { autoBackup } from './database/backup'
import { runMigrations, getSchemaVersion, compareVersions } from './database/schemaMigration'
import * as settingsRepo from './database/repositories/settings'

let mainWindow: BrowserWindow | null = null
const navigationShortcuts: Record<string, string> = {
  'F1': 'pos', 'F2': 'inventory', 'F3': 'dashboard', 'F4': 'admin',
}

function getLogPath(): string {
  const logDir = app.getPath('userData')
  return join(logDir, 'pos-error.log')
}

function logError(message: string, stack?: string): void {
  const timestamp = new Date().toISOString()
  const logEntry = `[${timestamp}] ${message}${stack ? '\nStack: ' + stack : ''}\n\n`
  try {
    const logPath = getLogPath()
    appendFileSync(logPath, logEntry, 'utf-8')
  } catch (e) { /* ignore */ }
  console.error(`[Danial Accounting] ${message}`, stack || '')
}

process.on('uncaughtException', (error) => {
  logError(`Uncaught Exception: ${error.message}`, error.stack)
  if (mainWindow) {
    dialog.showErrorBox('Application Error', `An error occurred:\n\n${error.message}\n\nCheck the log file for details:\n${getLogPath()}`)
  }
})

process.on('unhandledRejection', (reason: any) => {
  logError(`Unhandled Rejection: ${reason?.message || reason}`, reason?.stack)
})

function registerNavigationShortcuts(): void {
  globalShortcut.unregisterAll()
  try {
    const shortcutsRaw = settingsRepo.getSetting('shortcuts')
    if (shortcutsRaw) {
      const saved = JSON.parse(shortcutsRaw)
      const navMap: Record<string, string> = {
        'navigate:pos': 'F1', 'navigate:inventory': 'F2', 'navigate:dashboard': 'F3',
        'navigate:admin': 'F4', 'navigate:accounting': 'F8', 'navigate:sales': 'F9',
        'navigate:categories': 'F10', 'navigate:customers': 'Ctrl+Shift+C', 'navigate:help': 'F12',
        'global:fullscreen': 'F11',
      }
      for (const [action, defaultKey] of Object.entries(navMap)) {
        const key = saved[action] || defaultKey
        if (key === 'F11') {
          globalShortcut.register(key, () => { mainWindow?.setFullScreen(!mainWindow?.isFullScreen()) })
        } else if (key.startsWith('F')) {
          const page = action.replace('navigate:', '')
          globalShortcut.register(key, () => { mainWindow?.webContents.send('navigate', page) })
        } else {
          const page = action.replace('navigate:', '')
          globalShortcut.register(key, () => { mainWindow?.webContents.send('navigate', page) })
        }
      }
    } else {
      for (const [key, page] of Object.entries(navigationShortcuts)) {
        globalShortcut.register(key, () => { mainWindow?.webContents.send('navigate', page) })
      }
    }
  } catch {
    for (const [key, page] of Object.entries(navigationShortcuts)) {
      globalShortcut.register(key, () => { mainWindow?.webContents.send('navigate', page) })
    }
  }
}

app.whenReady().then(async () => {
  try {
    getDatabase()
    // seedDatabase() — disabled
    // Run schema migrations for version upgrades
    const migResult = runMigrations()
    if (migResult.applied.length > 0) {
      console.log(`[Migration] Applied: ${migResult.applied.join(', ')}`)
      dialog.showMessageBoxSync({
        type: 'info',
        title: 'بروزرسانی پایگاه داده',
        message: `پایگاه داده از نسخه ${migResult.applied[0]} به نسخه ${migResult.applied[migResult.applied.length - 1]} بروزرسانی شد.`,
        detail: `${migResult.applied.length} مرحله مهاجرت با موفقیت اجرا شد.`,
      })
    }
    if (migResult.errors.length > 0) {
      console.error(`[Migration] Errors: ${migResult.errors.join('; ')}`)
      dialog.showErrorBox(
        'خطا در مهاجرت دیتابیس',
        `مهاجرت پایگاه داده با خطا مواجه شد:\n\n${migResult.errors.join('\n')}\n\nبرنامه با دیتابیس قبلی ادامه می‌دهد.\nبرای رفع مشکل، از پشتیبان بازیابی کنید.`
      )
    }
    registerAllHandlers()

    // Check for downgrade: DB schema version > app version (numeric semver compare)
    const appVersion = app.getVersion()
    const dbVersion = getSchemaVersion()
    if (compareVersions(dbVersion, appVersion) > 0) {
      const result = dialog.showMessageBoxSync({
        type: 'warning',
        title: 'هشدار: نسخه قدیمی‌تر',
        message: `نسخه فعلی برنامه (${appVersion}) قدیمی‌تر از نسخه پایگاه داده (${dbVersion}) است.`,
        detail: 'امکان بازگشت به نسخه قبلی وجود ندارد. لطفاً نسخه جدیدتر برنامه را دانلود کنید.',
        buttons: ['خروج', 'ادامه با ریسک'],
        defaultId: 0,
      })
      if (result === 0) { app.quit(); return }
    }
    const autoBackupSetting = settingsRepo.getSetting('autoBackupEnabled')
    if (autoBackupSetting !== 'false') await autoBackup()
    createWindow()
    registerNavigationShortcuts()
  } catch (err) {
    logError('Startup error: ' + (err instanceof Error ? err.message : String(err)))
    dialog.showErrorBox('Startup Error', 'An error occurred during startup:\n\n' + (err instanceof Error ? err.message : String(err)) + '\n\nCheck the log file for details.')
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  closeDatabase()
  globalShortcut.unregisterAll()
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  closeDatabase()
})

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: `حسابداری دانیال — v${app.getVersion()}`,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
    },
    backgroundColor: '#0f172a',
    show: false,
  })

  mainWindow.on('ready-to-show', () => { mainWindow?.show() })

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    logError(`Page load failed: ${errorCode} - ${errorDescription}`)
    dialog.showErrorBox('Load Error', `Failed to load page:\n${errorDescription}\n\nError Code: ${errorCode}`)
  })

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    logError(`Renderer process crashed: ${details.reason}`)
    dialog.showErrorBox('App Crashed', `The renderer process has crashed.\nReason: ${details.reason}`)
  })

  mainWindow.webContents.on('console-message', (_event, level, message) => {
    if (level >= 2) {
      logError(`Console Error: ${message}`)
    }
  })

  mainWindow.on('closed', () => { mainWindow = null })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../../dist/index.html'))
  }

  buildMenu()
}

function buildMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        { label: 'Quit', accelerator: 'CmdOrCtrl+Q', role: 'quit' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Reset Zoom', accelerator: 'CmdOrCtrl+0', role: 'resetZoom' },
        { label: 'Zoom In', accelerator: 'CmdOrCtrl+=', role: 'zoomIn' },
        { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', role: 'zoomOut' },
        { type: 'separator' },
        { label: 'Full Screen', accelerator: 'F11', role: 'togglefullscreen' },
        { type: 'separator' },
        { label: 'Dev Tools', accelerator: 'F12', role: 'toggleDevTools' },
        { type: 'separator' },
        { label: 'View Error Log', click: () => {
          try { const log = readFileSync(getLogPath(), 'utf-8'); dialog.showMessageBox(mainWindow!, { type: 'info', title: 'Error Log', message: log || 'No errors logged.' }) }
          catch { dialog.showMessageBox(mainWindow!, { type: 'info', title: 'Error Log', message: 'No errors logged.' }) }
        }},
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
