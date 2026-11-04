// .gitignore 模板集合（参考 github/gitignore 官方模板整理）
export const GROUPS = [
  {
    id: 'lang',
    name: '语言',
    items: [
      {
        id: 'node',
        name: 'Node.js',
        lines: [
          'node_modules/',
          'npm-debug.log*',
          'yarn-debug.log*',
          'yarn-error.log*',
          'pnpm-debug.log*',
          '.npm/',
          '.yarn/cache',
          '.yarn/unplugged',
          '.yarn/install-state.gz',
          '.pnp.*',
          'package-lock.json.bak',
        ],
      },
      {
        id: 'python',
        name: 'Python',
        lines: [
          '__pycache__/',
          '*.py[cod]',
          '*$py.class',
          '*.so',
          'build/',
          'develop-eggs/',
          'dist/',
          'downloads/',
          'eggs/',
          '.eggs/',
          'parts/',
          'sdist/',
          'var/',
          'wheels/',
          '*.egg-info/',
          '*.egg',
          '.venv/',
          'venv/',
          '.pytest_cache/',
          '.coverage',
          'htmlcov/',
          '.mypy_cache/',
          '.ruff_cache/',
        ],
      },
      {
        id: 'java',
        name: 'Java',
        lines: [
          '*.class',
          '*.jar',
          '*.war',
          '*.ear',
          'target/',
          'out/',
          'build/',
          'hs_err_pid*',
          'replay_pid*',
        ],
      },
      {
        id: 'go',
        name: 'Go',
        lines: ['*.exe', '*.exe~', '*.dll', '*.so', '*.dylib', '*.test', '*.out', 'go.work', 'go.work.sum', 'vendor/'],
      },
      {
        id: 'rust',
        name: 'Rust',
        lines: ['/target/', '**/*.rs.bk', '*.pdb', 'Cargo.lock.bak'],
      },
      {
        id: 'cpp',
        name: 'C / C++',
        lines: ['*.o', '*.obj', '*.ko', '*.elf', '*.gcno', '*.gcda', '*.a', '*.lib', '*.so', '*.dylib', '*.dll', '*.exe', '*.out'],
      },
      {
        id: 'csharp',
        name: 'C# / .NET',
        lines: ['[Bb]in/', '[Oo]bj/', '[Ll]og/', '[Ll]ogs/', '.vs/', '*.user', '*.suo', '*.userosscache', '*.sln.docstates', 'packages/'],
      },
      {
        id: 'php',
        name: 'PHP',
        lines: ['vendor/', 'composer.phar', '.phpunit.result.cache', '.php-cs-fixer.cache'],
      },
      {
        id: 'ruby',
        name: 'Ruby',
        lines: ['*.gem', '.bundle/', 'vendor/bundle/', '.ruby-version.bak', 'coverage/'],
      },
      {
        id: 'swift',
        name: 'Swift',
        lines: ['.build/', 'Packages/', '*.xcodeproj/xcuserdata/', '*.xcworkspace/xcuserdata/', '.swiftpm/', 'DerivedData/'],
      },
      {
        id: 'kotlin',
        name: 'Kotlin',
        lines: ['*.class', '.gradle/', 'build/', 'out/', '*.iml', '.kotlin/'],
      },
      {
        id: 'dart',
        name: 'Dart / Flutter',
        lines: ['.dart_tool/', '.flutter-plugins', '.flutter-plugins-dependencies', '.packages', 'build/', '*.iml', '.pub-cache/', '.pub/'],
      },
      {
        id: 'elixir',
        name: 'Elixir',
        lines: ['_build/', 'cover/', 'deps/', 'doc/', 'erl_crash.dump', '*.ez', '*.beam'],
      },
      {
        id: 'scala',
        name: 'Scala',
        lines: ['target/', 'project/target/', 'project/project/', '.bsp/', '.metals/'],
      },
      {
        id: 'r',
        name: 'R',
        lines: ['.Rproj.user', '.Rhistory', '.RData', '.Ruserdata', '*.Rproj.bak'],
      },
      {
        id: 'latex',
        name: 'LaTeX',
        lines: ['*.aux', '*.log', '*.out', '*.toc', '*.synctex.gz', '*.bbl', '*.blg', '*.fls', '*.fdb_latexmk', '*.xdv'],
      },
    ],
  },
  {
    id: 'framework',
    name: '框架 / 构建',
    items: [
      {
        id: 'vite',
        name: 'Vite',
        lines: ['dist/', 'dist-ssr/', '*.local', '.vite/'],
      },
      {
        id: 'vue',
        name: 'Vue / Nuxt',
        lines: ['.nuxt/', '.output/', '.data/', '.nitro/', '.cache/', '.vuepress/dist/', '.temp/'],
      },
      {
        id: 'react',
        name: 'React / Next.js',
        lines: ['.next/', 'out/', '.vercel/', '.turbo/', '.swc/'],
      },
      {
        id: 'angular',
        name: 'Angular',
        lines: ['.angular/', 'dist/', 'tmp/', 'coverage/', '.sass-cache/'],
      },
      {
        id: 'maven',
        name: 'Maven',
        lines: ['target/', 'pom.xml.tag', 'pom.xml.releaseBackup', 'pom.xml.versionsBackup', 'release.properties', '.flattened-pom.xml'],
      },
      {
        id: 'gradle',
        name: 'Gradle',
        lines: ['.gradle/', 'build/', '!gradle/wrapper/gradle-wrapper.jar', 'local.properties'],
      },
      {
        id: 'django',
        name: 'Django',
        lines: ['*.log', 'local_settings.py', 'db.sqlite3', 'db.sqlite3-journal', 'media/', 'staticfiles/', '.env'],
      },
      {
        id: 'flask',
        name: 'Flask',
        lines: ['instance/', '.webassets-cache', '.env'],
      },
      {
        id: 'laravel',
        name: 'Laravel',
        lines: ['/vendor', '/node_modules', '/public/storage', '/public/hot', 'storage/*.key', '.env', '.env.backup'],
      },
      {
        id: 'rails',
        name: 'Rails',
        lines: ['log/', 'tmp/', 'storage/', 'public/assets/', '.env', 'db/*.sqlite3'],
      },
      {
        id: 'unity',
        name: 'Unity',
        lines: ['[Ll]ibrary/', '[Tt]emp/', '[Oo]bj/', '[Bb]uild/', '[Bb]uilds/', '[Ll]ogs/', '[Uu]ser[Ss]ettings/', '*.csproj', '*.unityproj', '*.sln', '*.pidb', '*.userprefs'],
      },
      {
        id: 'terraform',
        name: 'Terraform',
        lines: ['.terraform/', '*.tfstate', '*.tfstate.*', 'crash.log', '*.tfvars', 'override.tf', 'override.tf.json'],
      },
      {
        id: 'jupyter',
        name: 'Jupyter Notebook',
        lines: ['.ipynb_checkpoints/', '*.ipynb.bak'],
      },
      {
        id: 'docker',
        name: 'Docker',
        lines: ['docker-compose.override.yml', '*.pid', '.docker/'],
      },
    ],
  },
  {
    id: 'editor',
    name: '编辑器 / IDE',
    items: [
      {
        id: 'vscode',
        name: 'VS Code',
        lines: ['.vscode/*', '!.vscode/settings.json', '!.vscode/tasks.json', '!.vscode/launch.json', '!.vscode/extensions.json', '*.code-workspace', '.history/', '*.vsix'],
      },
      {
        id: 'jetbrains',
        name: 'JetBrains（IDEA / WebStorm）',
        lines: ['.idea/', '*.iml', '*.iws', '*.ipr', 'out/', '.idea_modules/', '*.hprof'],
      },
      {
        id: 'sublime',
        name: 'Sublime Text',
        lines: ['*.sublime-workspace', '*.sublime-session'],
      },
      {
        id: 'vim',
        name: 'Vim',
        lines: ['*.swp', '*.swo', '*.swn', '.netrwhist', 'tags.lock'],
      },
      {
        id: 'emacs',
        name: 'Emacs',
        lines: ['*~', '\\#*\\#', '.\\.#*', '.dir-locals-2.el'],
      },
      {
        id: 'eclipse',
        name: 'Eclipse',
        lines: ['.metadata/', 'bin/', 'tmp/', '*.tmp', '*.bak', '.settings/org.eclipse.core.resources.prefs'],
      },
      {
        id: 'visualstudio',
        name: 'Visual Studio',
        lines: ['.vs/', '*.user', '*.suo', '*.userosscache', '*.sln.docstates', 'TestResults/'],
      },
      {
        id: 'xcode',
        name: 'Xcode',
        lines: ['build/', 'DerivedData/', '*.xcuserstate', 'xcuserdata/', '*.moved-aside', '*.hmap', '*.ipa', '*.dSYM.zip'],
      },
    ],
  },
  {
    id: 'os',
    name: '操作系统',
    items: [
      {
        id: 'macos',
        name: 'macOS',
        lines: ['.DS_Store', '.AppleDouble', '.LSOverride', 'Icon?', '._*', '.DocumentRevisions-V100', '.fseventsd', '.Spotlight-V100', '.TemporaryItems', '.Trashes', '.VolumeIcon.icns'],
      },
      {
        id: 'windows',
        name: 'Windows',
        lines: ['Thumbs.db', 'Thumbs.db:encryptable', 'ehthumbs.db', 'Desktop.ini', '$RECYCLE.BIN/', '*.lnk', '*.stackdump'],
      },
      {
        id: 'linux',
        name: 'Linux',
        lines: ['*~', '.fuse_hidden*', '.directory', '.Trash-*', '.nfs*'],
      },
    ],
  },
  {
    id: 'common',
    name: '通用',
    items: [
      {
        id: 'env',
        name: '环境变量与密钥',
        lines: ['.env', '.env.local', '.env.*.local', '!.env.example', '*.pem', '*.key', '*.p12', '*.keystore', 'secrets.json'],
      },
      {
        id: 'logs',
        name: '日志与临时文件',
        lines: ['*.log', 'logs/', 'tmp/', 'temp/', '*.tmp', '*.temp', '*.bak', '*.orig', '*.rej', '.cache/'],
      },
      {
        id: 'db',
        name: '数据库文件',
        lines: ['*.sqlite', '*.sqlite3', '*.db', '*.db-journal', '*.mdb', '*.ldb'],
      },
      {
        id: 'coverage',
        name: '测试覆盖率',
        lines: ['coverage/', '.nyc_output/', '*.lcov', 'test-results/', 'playwright-report/', '.playwright/'],
      },
      {
        id: 'archive',
        name: '压缩包',
        lines: ['*.zip', '*.tar', '*.tar.gz', '*.tgz', '*.rar', '*.7z', '*.gz'],
      },
      {
        id: 'build',
        name: '构建产物',
        lines: ['dist/', 'build/', 'out/', 'release/', '*.min.js.map', '*.map'],
      },
    ],
  },
]

export const PRESETS = [
  {
    id: 'frontend',
    name: '前端项目（Vue / Vite）',
    items: ['node', 'vite', 'vue', 'vscode', 'macos', 'windows', 'env', 'logs', 'coverage'],
  },
  {
    id: 'node',
    name: 'Node 后端',
    items: ['node', 'vscode', 'macos', 'windows', 'env', 'logs', 'coverage', 'db'],
  },
  {
    id: 'java',
    name: 'Java 后端（Maven）',
    items: ['java', 'maven', 'jetbrains', 'eclipse', 'macos', 'windows', 'env', 'logs'],
  },
  {
    id: 'spring',
    name: 'Spring Boot',
    items: ['java', 'maven', 'gradle', 'jetbrains', 'macos', 'windows', 'env', 'logs', 'db'],
  },
  {
    id: 'python',
    name: 'Python',
    items: ['python', 'vscode', 'macos', 'env', 'logs', 'jupyter', 'coverage'],
  },
  {
    id: 'go',
    name: 'Go',
    items: ['go', 'vscode', 'macos', 'linux', 'env', 'logs', 'build'],
  },
  {
    id: 'flutter',
    name: 'Flutter / Dart',
    items: ['dart', 'kotlin', 'jetbrains', 'macos', 'windows', 'env', 'logs'],
  },
  {
    id: 'fullstack',
    name: '全栈（Vue + Java）',
    items: ['node', 'vite', 'vue', 'java', 'maven', 'jetbrains', 'vscode', 'macos', 'windows', 'env', 'logs', 'coverage'],
  },
]
