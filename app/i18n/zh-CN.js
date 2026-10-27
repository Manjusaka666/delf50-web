/** 界面文字 · 简体中文（课程材料本身的中文讲解在课程数据中）。 */
const joinZh = (xs) => xs.join('、');

export default {
  'meta.description': 'DELF B1 · B2 · 50 天：语法、阅读、听力、写作、口语与应用，每天固定的学习路线，可随时切换级别。',
  'meta.noscript': 'DELF50 需要启用 JavaScript。',

  // modules and their units
  'module.grammar': '语法', 'module.production': '主动产出', 'module.reading': '阅读', 'module.listening': '听力', 'module.writing': '写作',
  'module.speaking': '口语', 'module.application': '应用', 'module.vocab': '词块', 'module.review': '复习',
  'unit.grammar': '题', 'unit.production': '句', 'unit.reading': '篇', 'unit.listening': '组', 'unit.writing': '项',
  'unit.speaking': '轮', 'unit.application': '项', 'unit.vocab': '个', 'unit.review': '项',
  'intensity.hours': '{h}小时',

  // shell
  'nav.today': '今日', 'nav.route': '路线', 'nav.review': '错题', 'nav.progress': '进度', 'nav.archive': '档案', 'nav.guide': '指南',
  'nav.main': '主导航', 'nav.more': '更多',
  'shell.skip': '跳到内容', 'shell.home': 'DELF50 首页', 'shell.levels': '级别', 'shell.soon': '即将', 'shell.soonTitle': '{level} 即将开放',
  'shell.account': '账号与设置',
  'status.loading': '载入中', 'status.saving': '保存中', 'status.saved': '已保存', 'status.error': '保存失败 · 自动重试',
  'error.title': '出错了', 'error.heading': '页面暂时无法载入', 'error.reload': '重新载入',
  'fatal.heading': '暂时无法载入学习记录', 'fatal.lead': '为保证每条记录都保存到账号，载入成功后才会开始学习。', 'fatal.retry': '重试',
  'splash.loading': '载入中',

  // account and settings
  'account.learner': '学习者', 'account.email': '邮箱', 'account.course': '课程', 'account.save': '保存', 'account.started': '开始学习',
  'account.notStarted': '尚未开始', 'account.close': '关闭', 'account.signOut': '退出登录',
  'settings.title': '设置', 'settings.language': '界面语言', 'settings.languageNote': '课程材料始终是法语；讲解、释义和界面使用所选语言。',
  'settings.appearance': '外观', 'settings.theme.system': '跟随系统', 'settings.theme.light': '浅色', 'settings.theme.dark': '深色',
  'settings.voice': '法语朗读声音', 'settings.voiceAuto': '自动（最佳可用）', 'settings.voicePreview': '试听',
  'settings.voiceNone': '此设备没有法语声音。', 'settings.voiceNote': '声音来自你的设备。标有“高品质”的声音最自然；在 Apple 设备上可于“设置 › 辅助功能 › 朗读内容 › 声音”中下载增强版法语声音。',
  'settings.voiceQuality': '高品质', 'settings.voiceOnline': '在线（需连网，可能无法使用）', 'settings.saveFailed': '设置未能保存到账号，仅在本次使用中生效。',
  'settings.voiceSample': 'Bonjour ! Je vais lire les documents sonores de votre préparation au DELF.',

  // sign-in
  'auth.welcome': '欢迎回来', 'auth.create': '创建账号',
  'auth.leadLogin': '登录后继续你的 50 天课程。',
  'auth.leadRegister': '注册后即可开始 DELF B1 或 B2 的 50 天课程，可随时切换级别。所有作答、写作和录音都实时保存在你的账号中，换设备登录即可继续。',
  'auth.login': '登录', 'auth.register': '注册', 'auth.mode': '登录或注册',
  'auth.name': '昵称', 'auth.namePh': '怎么称呼你', 'auth.email': '邮箱', 'auth.password': '密码', 'auth.passwordMin': '（至少 8 位）',
  'auth.submitLogin': '登录', 'auth.submitRegister': '注册并开始学习', 'auth.wait': '请稍候…',
  'auth.expired': '登录已过期，请重新登录；未保存的内容会在登录后自动保存。',
  'auth.language': '语言',

  // API errors
  'api.network': '无法连接服务器，请检查网络。', 'api.failed': '操作失败，请重试。',
  'api.INVALID_EMAIL_OR_PASSWORD': '邮箱或密码不正确。', 'api.USER_ALREADY_EXISTS': '该邮箱已注册，请直接登录。',
  'api.PASSWORD_TOO_SHORT': '密码至少 8 位。', 'api.INVALID_EMAIL': '邮箱格式不正确。', 'api.EMAIL_NOT_VERIFIED': '请先完成邮箱验证。',

  // shared pieces
  'punct.stop': '。',
  'common.optional': '选做', 'common.next': '下一篇', 'common.backToday': '回到今日', 'common.crumbs': '位置',
  'common.words': ({ n }) => `${n} 词`, 'common.wordUnit': '词',
  'common.correctOf': ({ n, total }) => `${n} / ${total} 正确`, 'common.answeredOf': ({ n, total }) => `${n} / ${total} 已答`,
  'common.playback': '回放', 'common.clipUnavailable': '录音不可用', 'common.timed': '计时练习', 'common.source': '来源',
  'common.prev': '上一题', 'common.nextQ': '下一题', 'common.prevItem': '上一项', 'common.nextItem': '下一项',
  'common.correct': '回答正确', 'common.toErrors': '已记入错题本', 'common.options': '选项',
  'exam.method': '考试方法', 'exam.grid': '官方评分维度',

  // chunk recall
  'recall.inputLabel': '填写缺少的法语表达', 'recall.topicChunk': '主题词块', 'recall.youWrote': '你写的', 'recall.correctSpelling': '正确拼写',
  'recall.ok': '拼写正确', 'recall.bad': '拼写有误 · 已加入再练', 'recall.shown': '已显示答案 · 已加入再练',
  'recall.say': '朗读', 'recall.next': '下一个', 'recall.first': '首字母', 'recall.words': ({ n }) => `${n} 个词`,
  'recall.rule': '拼写（含重音符号）须准确，空格和大小写不计。', 'recall.accents': '插入法语字母', 'recall.giveUp': '看答案', 'recall.check': '核对',

  // day
  'day.progressAria': '今日完成 {n}%', 'day.complete': '今日已完成', 'day.progress': '今日完成度', 'day.phases': '阶段',
  'day.intensity': '学习强度', 'day.intensityNote': '强度只决定当天需要完成多少；题目固定不变，超出部分可选做。',
  'day.modules': '今日模块', 'day.notes': '今日要点', 'day.nav': '切换日期',
  'day.canDo': '能做到', 'day.review': '复习', 'day.input': '输入', 'day.output': '输出', 'day.checkpoint': '检查点', 'day.challenge': '挑战',

  // grammar
  'grammar.contrast': '对比', 'grammar.errors': '常见错误', 'grammar.delf': 'DELF 用法', 'grammar.examples': '例句',
  'grammar.summary': ({ done, total, answered, right }) => `今日 ${done} / ${total} 题 · 已答 ${answered} 题，正确 ${right} 题`,
  'grammar.remedial': ({ list }) => `今日补练按你 Day 1–30 正确率最低的语法点出题：${list.join(' · ')}。题目接着各语法点题库中未做过的部分。`,
  'grammar.questions': '题目',
  'grammar.dot': ({ n, state, optional }) => `第 ${n} 题${state === 'ok' ? '，正确' : state === 'bad' ? '，错误' : ''}${optional ? '，选做' : ''}`,
  'grammar.bridge': '{level} 衔接 · 选做',
  'grammar.hint': ({ keys }) => `按 ${keys} 或数字键作答，答案提交后不可更改。`,
  'production.count': ({ done, target }) => `${done} / ${target} 句`,
  'production.how': '每条提示完成 2 个句子：在下方输入框写下（随输入自动保存，并自动打勾），或说出后手动打勾。',
  'production.input': '写下你的句子',
  'production.extraPrompt': '用 {name} 再造 2 个和今天主题有关的新句子，并口头说一遍。',

  // reading and listening
  'text.playedOnce': '考试中只听一遍', 'text.playedTwice': '考试中听两遍',
  'text.hideScript': '隐藏原文', 'text.showScript': '显示原文', 'text.listenFirst': '先只听不看，作答后再对照原文。',
  'text.questions': '问题', 'text.comprehension': '理解题', 'text.hint': '每题作答后立即显示解析，答案不可更改。',

  // the listening player
  'player.unsupported': '当前浏览器不支持法语语音合成，请使用最新版 Chrome、Edge 或 Safari，或直接阅读原文。',
  'player.noVoice': '此设备没有法语声音，朗读可能不准确。可在系统设置中添加法语语音，或直接阅读原文。',
  'player.failed': '没有声音：此设备的法语声音都无法朗读（在线声音可能连不上服务器）。请再点一次播放；若仍无声音，请在设置中换一个法语声音，或在系统设置中添加离线法语语音。也可以先阅读原文。',
  'player.blocked': '浏览器阻止了朗读。请直接点击播放按钮开始播放。',
  'player.iosMute': '没有声音？请关闭 iPhone / iPad 的静音模式并调高媒体音量。',
  'player.play': '播放', 'player.pause': '暂停', 'player.resume': '继续', 'player.stop': '停止',
  'player.idle': '播放录音', 'player.paused': '已暂停', 'player.playing': '正在播放',
  'player.sentence': ({ at, total }) => `第 ${at} / ${total} 句`,
  'player.prev': '上一句', 'player.next': '下一句', 'player.repeat': '重听这一句', 'player.speed': '语速',
  'player.voices': ({ n }) => (n > 1 ? `对话 · ${n} 个声音` : '单一声音'),
  'player.keys': '空格 播放/暂停 · ← → 上/下一句 · R 重听',

  // writing and application
  'write.chunks': '可用表达 · 点击插入', 'write.checklist': '提交前自查', 'write.again': '再写一版', 'write.answer': '你的回答',
  'write.draftSaved': '草稿随输入实时保存',
  'write.short': ({ min }) => `还不到 ${min} 词。DELF 写作字数不足会扣分，确定先提交这一版吗？`,
  'write.submitAnyway': '仍然提交', 'write.submit': '提交', 'write.submitted': '已提交', 'write.versions': ({ n }) => `${n} 版`,
  'write.model': '参考范文', 'write.modelNote': '提交后对照：结构、连接词、语式',

  // speaking
  'speak.micError': '无法使用麦克风。请在浏览器中允许麦克风权限，或使用“计时练习”。',
  'speak.review': ({ d }) => `时长 ${d}。回听一遍，满意就保存到账号。`,
  'speak.redo': '重录', 'speak.keep': '保存录音', 'speak.uploading': '正在上传到云端，完成前请不要关闭页面…',
  'speak.stop': '结束', 'speak.start': '开始录音',
  'speak.recording': '录音中 · 目标时长到达后变绿', 'speak.timing': '计时中 · 不录音',
  'speak.ready': '点击开始录音，说完点击结束。', 'speak.cannot': '当前浏览器不支持录音，可使用计时练习。',
  'speak.timer': '计时练习（不录音）', 'speak.notesThen': '当时的提纲 / 文字稿',
  'speak.notes': '提纲 / 文字稿', 'speak.notesNote': '随输入实时保存；保存录音或计时练习时会附上这一版',
  'speak.followUps': '考官可能的追问', 'speak.doc': ({ d }) => `先读引子文档 · Jour ${d}`, 'speak.checklist': '评分要点',
  'speak.done': '已完成', 'speak.rounds': ({ n }) => `${n} 轮`,

  // chunks
  'vocab.summary': ({ done, total, known, again }) => `今日 ${done} / ${total} 个 · 拼对 ${known} · 再练 ${again}。`,
  'vocab.how': '词块来自当天的阅读、听力和写作口语任务：看中文和例句，在空格处写出缺少的法语，系统核对拼写。',
  'vocab.allDone': '今天的词块都拼对了', 'vocab.allDoneNote': '可以点右侧任意词块再写一遍，或回到今日继续其他模块。',

  // spaced review
  'review.empty': '暂无可复习的内容。', 'review.title': '间隔复习',
  'review.summary': ({ done, total, days }) => `今日 ${done} / ${total} 项（圆形为语法题，方形为词块）· 复习 ${joinZh(days)} 的语法与词块（间隔 1、3、7、14、21、30、45 天）。`,
  'review.items': '复习项', 'review.dot': ({ n, chunk }) => `第 ${n} 项（${chunk ? '词块' : '语法'}）`,

  // error book
  'errors.title': '错题本', 'errors.other': '其他', 'errors.all': '全部', 'errors.resolve': '已掌握',
  'errors.lead': '答错的语法题自动记入。复习时先遮住答案自己说出正确形式，确认掌握后移出错题本。',
  'errors.empty': '错题本是空的', 'errors.emptyNote': '答错的语法题会出现在这里。',

  // progress
  'progress.title': '学习进度', 'progress.lead': '完成度按当前强度计算，全部来自你的作答记录。',
  'progress.daysDone': '已完成天数', 'progress.daysStudied': '学习过的天数', 'progress.words': '写作总词数',
  'progress.minutes': '分钟', 'progress.speaking': '口语练习', 'progress.chunkUnit': '个', 'progress.chunks': '已记住的词块',
  'progress.sentenceUnit': '句', 'progress.production': '主动产出', 'progress.errors': '待复习错题', 'progress.accuracy': '正确率',
  'progress.mastery': '语法点掌握度', 'progress.weakestFirst': '由低到高',
  'progress.remedial': ({ list }) => `Day 41–50 的补练按 Day 1–30 语法点中正确率最低的三个出题，当前为：${list.join(' · ')}。`,
  'progress.fifty': '50 天', 'progress.log': '学习记录',
  'progress.col.day': '天', 'progress.col.theme': '主题', 'progress.col.done': '完成度', 'progress.col.first': '首次', 'progress.col.last': '最近',

  // archive
  'archive.title': '学习档案', 'archive.back': '档案', 'archive.open': ({ d }) => `打开 Jour ${d}`,
  'archive.lead': '每一天的作答、写作与录音，按日期保存。',
  'archive.prompts': ({ n }) => `${n} 条`, 'archive.known': ({ n, total }) => `记住 ${n} / ${total}`,
  'archive.remembered': '记住了', 'archive.again': '再练',
  'archive.dayEmpty': '这一天还没有记录', 'archive.dayEmptyNote': '作答、写作和录音都会按时间保存在这里。',
  'archive.records': ({ n }) => `${n} 条记录`, 'archive.latest': ({ t }) => `最近 ${t}`,
  'archive.empty': '还没有学习记录', 'archive.emptyNote': '开始今天的学习后，记录会出现在这里。',

  // route
  'route.title': ({ title }) => `${title} 路线`, 'route.fixed': '每一天的题目都是固定的，可随时回看任一天。',

  // guide
  'guide.title': '学习指南', 'guide.short': '指南',
  'guide.lead': '选择每日强度后，按今日页的模块依次完成即可；顶栏可随时切换级别，各级别的进度互不影响，所有记录实时保存在你的账号中。',
  'guide.intensity': '每日强度', 'guide.method': '每个模块怎么学',
  'guide.exam': ({ name }) => `${name} 考试结构`, 'guide.points': '25 分',
  'guide.grids': '写作与口语的官方评分维度', 'guide.gridWriting': '写作', 'guide.gridSpeaking': '口语',
  'guide.gridsNote': '依据 France Éducation international 公布的评分表与评分标准说明；写作和口语页面也可随时展开对照。',
  'guide.resources': '免费拓展资源', 'guide.grammar': '语法点', 'guide.nodes': ({ n }) => `${n} 个`, 'guide.sources': '资料来源',
  'guide.m.grammar': '每题作答后立即显示解析，答错的题自动进入错题本。Day 41–50 按你正确率最低的三个语法点自适应补练。',
  'guide.m.production': '每条提示造 2 个句子，写下或说出后打勾。',
  'guide.m.reading': '先通读全文，再逐题作答；每题答后显示依据。',
  'guide.m.listening': '先只听不看原文，作答后再对照原文复听。',
  'guide.m.writing': '草稿随输入保存；对照字数与自查清单后提交，可多次提交。',
  'guide.m.speaking': '按目标时长录音，录音保存在你的账号；也可计时练习。',
  'guide.m.application': '使用给出的表达完成情境或转述任务，关键词会实时标出。',
  'guide.m.vocab': '当天材料与任务中的高频搭配：看中文和例句，在空格处写出缺少的法语；拼写（含重音）须准确，空格和大小写不计。拼对记为“记住”，拼错或看答案记为“再练”，会再次出现。',
  'guide.m.review': '按 1、3、7、14、21、30、45 天的间隔，交替复现前面各天的语法题和词块（词块同样需要拼写）；答错的语法题进入错题本。'
};
