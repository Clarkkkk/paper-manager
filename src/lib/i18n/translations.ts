export const translations = {
  zh: {
    // Navigation
    'nav.papers': '论文库',
    'nav.settings': '设置',
    'nav.logout': '退出登录',
    'nav.myPapers': '我的论文',
    
    // Dashboard
    'dashboard.title': '我的论文库',
    'dashboard.subtitle': '上传论文，让 AI 帮你生成结构化笔记',
    'dashboard.upload': '上传',
    'dashboard.empty.title': '开始你的研究之旅',
    'dashboard.empty.subtitle': '上传你的第一篇论文，AI 将自动为你生成结构化笔记，并支持交互式问答',
    
    // Upload
    'upload.title': '上传论文',
    'upload.description': '支持 PDF 格式，最大 50MB',
    'upload.dropzone': '点击或拖拽文件到此处',
    'upload.onlyPdf': '仅支持 PDF 格式',
    'upload.paperTitle': '论文标题',
    'upload.authors': '作者（可选）',
    'upload.tags': '标签（可选）',
    'upload.tagsPlaceholder': '输入标签后按 Enter 添加',
    'upload.uploading': '上传中...',
    'upload.processing': '处理中...',
    'upload.done': '完成!',
    'upload.button': '上传论文',
    
    // Paper Reader
    'reader.notes': '笔记',
    'reader.chat': '对话',
    'reader.generateNotes': '生成 AI 笔记',
    'reader.regenerate': '重新生成',
    'reader.generating': '生成中...',
    'reader.noNotes': '还没有笔记',
    'reader.noNotesDesc': '点击上方按钮，让 AI 为你生成结构化的论文笔记',
    'reader.extractingPdf': '正在提取 PDF 内容...',
    
    // Chat
    'chat.placeholder': '询问关于这篇论文的问题...',
    'chat.startTitle': '开始对话',
    'chat.startDesc': '向 AI 提问关于这篇论文的任何问题',
    'chat.suggestion1': '这篇论文的主要贡献是什么？',
    'chat.suggestion2': '作者使用了什么方法？',
    'chat.suggestion3': '实验结果如何？',
    'chat.disclaimer': 'AI 回答基于论文内容，可能存在不准确之处',
    
    // Settings
    'settings.title': '设置',
    'settings.subtitle': '管理你的 API 配置和偏好',
    'settings.apiKey.title': 'OpenAI API Key',
    'settings.apiKey.desc': '配置自己的 API Key 以解锁高级模型',
    'settings.apiKey.label': 'API Key',
    'settings.apiKey.clear': '清除',
    'settings.apiKey.hint': '你的 API Key 将被安全存储。获取 Key:',
    'settings.apiKey.configured': '已配置自定义 API Key',
    'settings.apiKey.default': '使用系统默认 Key（免费模型）',
    'settings.model.title': 'AI 模型',
    'settings.model.desc': '选择用于生成笔记和对话的模型',
    'settings.model.premiumRequired': '配置自己的 API Key 后才能使用 Premium 模型',
    'settings.save': '保存设置',
    'settings.saving': '保存中...',
    'settings.saved': '设置已保存',
    'settings.language': '语言',
    'settings.language.desc': '选择界面显示语言',
    
    // Export
    'export.button': '导出笔记',
    'export.markdown': '导出为 Markdown',
    'export.pdf': '导出为 PDF',
    'export.copied': '已复制到剪贴板',
    
    // Common
    'common.delete': '删除',
    'common.deleting': '删除中...',
    'common.open': '打开',
    'common.cancel': '取消',
    'common.confirm': '确认',
    'common.success': '成功',
    'common.error': '错误',
    'common.loading': '加载中...',
    
    // Time
    'time.justNow': '刚刚',
    'time.minutesAgo': '{n} 分钟前',
    'time.hoursAgo': '{n} 小时前',
    'time.daysAgo': '{n} 天前',
  },
  
  en: {
    // Navigation
    'nav.papers': 'Papers',
    'nav.settings': 'Settings',
    'nav.logout': 'Sign Out',
    'nav.myPapers': 'My Papers',
    
    // Dashboard
    'dashboard.title': 'My Papers',
    'dashboard.subtitle': 'Upload papers and let AI generate structured notes',
    'dashboard.upload': 'Upload',
    'dashboard.empty.title': 'Start Your Research Journey',
    'dashboard.empty.subtitle': 'Upload your first paper, AI will generate structured notes and support interactive Q&A',
    
    // Upload
    'upload.title': 'Upload Paper',
    'upload.description': 'PDF format supported, max 50MB',
    'upload.dropzone': 'Click or drag file here',
    'upload.onlyPdf': 'Only PDF format supported',
    'upload.paperTitle': 'Paper Title',
    'upload.authors': 'Authors (optional)',
    'upload.tags': 'Tags (optional)',
    'upload.tagsPlaceholder': 'Press Enter to add tag',
    'upload.uploading': 'Uploading...',
    'upload.processing': 'Processing...',
    'upload.done': 'Done!',
    'upload.button': 'Upload Paper',
    
    // Paper Reader
    'reader.notes': 'Notes',
    'reader.chat': 'Chat',
    'reader.generateNotes': 'Generate AI Notes',
    'reader.regenerate': 'Regenerate',
    'reader.generating': 'Generating...',
    'reader.noNotes': 'No Notes Yet',
    'reader.noNotesDesc': 'Click the button above to let AI generate structured notes',
    'reader.extractingPdf': 'Extracting PDF content...',
    
    // Chat
    'chat.placeholder': 'Ask questions about this paper...',
    'chat.startTitle': 'Start Conversation',
    'chat.startDesc': 'Ask AI anything about this paper',
    'chat.suggestion1': 'What are the main contributions?',
    'chat.suggestion2': 'What methods did the authors use?',
    'chat.suggestion3': 'What are the experimental results?',
    'chat.disclaimer': 'AI responses are based on paper content and may not be accurate',
    
    // Settings
    'settings.title': 'Settings',
    'settings.subtitle': 'Manage your API configuration and preferences',
    'settings.apiKey.title': 'OpenAI API Key',
    'settings.apiKey.desc': 'Configure your own API Key to unlock premium models',
    'settings.apiKey.label': 'API Key',
    'settings.apiKey.clear': 'Clear',
    'settings.apiKey.hint': 'Your API Key will be stored securely. Get Key:',
    'settings.apiKey.configured': 'Custom API Key configured',
    'settings.apiKey.default': 'Using system default Key (free model)',
    'settings.model.title': 'AI Model',
    'settings.model.desc': 'Select model for generating notes and chat',
    'settings.model.premiumRequired': 'Configure your own API Key to use Premium models',
    'settings.save': 'Save Settings',
    'settings.saving': 'Saving...',
    'settings.saved': 'Settings saved',
    'settings.language': 'Language',
    'settings.language.desc': 'Select interface language',
    
    // Export
    'export.button': 'Export Notes',
    'export.markdown': 'Export as Markdown',
    'export.pdf': 'Export as PDF',
    'export.copied': 'Copied to clipboard',
    
    // Common
    'common.delete': 'Delete',
    'common.deleting': 'Deleting...',
    'common.open': 'Open',
    'common.cancel': 'Cancel',
    'common.confirm': 'Confirm',
    'common.success': 'Success',
    'common.error': 'Error',
    'common.loading': 'Loading...',
    
    // Time
    'time.justNow': 'just now',
    'time.minutesAgo': '{n} minutes ago',
    'time.hoursAgo': '{n} hours ago',
    'time.daysAgo': '{n} days ago',
  },
} as const

export type Language = keyof typeof translations
export type TranslationKey = keyof typeof translations.zh
