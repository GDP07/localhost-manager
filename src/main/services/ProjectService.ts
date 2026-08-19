import fs from 'fs';
import path from 'path';
import { FrameworkInfo } from '../../shared/types/service';

/** Files that mean "the root of something someone works on". */
const PROJECT_MARKERS = [
  'package.json',
  'go.mod',
  'Cargo.toml',
  'pyproject.toml',
  'requirements.txt',
  'setup.py',
  'composer.json',
  'Gemfile',
  'pom.xml',
  'build.gradle',
  'manage.py',
  'artisan',
  'docker-compose.yml',
  'compose.yml',
  '.git'
];

interface ProjectDetectionResult {
  projectPath: string | null;
  projectName: string | null;
  framework: FrameworkInfo | null;
}

export class ProjectService {
  private cache = new Map<string, { timestamp: number; result: ProjectDetectionResult }>();
  private readonly CACHE_TTL_MS = 30000; // 30s cache

  detectProject(
    cwd: string | null,
    commandLine: string,
    processName: string,
    port: number
  ): ProjectDetectionResult {
    // 1. Check known database/infrastructure services first
    const dbFramework = this.detectDatabaseService(processName, commandLine, port);
    if (dbFramework) {
      return {
        projectPath: cwd,
        projectName: dbFramework.name,
        framework: dbFramework
      };
    }

    // 2. If CWD exists, check cache
    if (cwd && this.cache.has(cwd)) {
      const cached = this.cache.get(cwd)!;
      if (Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
        return cached.result;
      }
    }

    // 3. Detect from directory markers
    let result: ProjectDetectionResult = {
      projectPath: cwd,
      projectName: cwd ? path.basename(cwd) : null,
      framework: null
    };

    if (cwd && fs.existsSync(cwd)) {
      result = this.inspectDirectory(cwd, commandLine);
      this.cache.set(cwd, { timestamp: Date.now(), result });
      return result;
    }

    // 4. Fallback: parse command line to extract possible project dir and framework
    const cmdResult = this.detectFromCommandLine(commandLine, processName);
    return cmdResult;
  }

  private inspectDirectory(dir: string, commandLine: string): ProjectDetectionResult {
    const hasMarker = PROJECT_MARKERS.some((marker) => fs.existsSync(path.join(dir, marker)));

    // Only name the directory when it looks like a project root. A bare cwd such as
    // ".../Riot Client.app/Contents/Frameworks" is a location, not a project.
    let projectName: string | null = hasMarker ? path.basename(dir) : null;
    let framework: FrameworkInfo | null = null;

    // A. Check Node.js / JavaScript / TypeScript projects (package.json)
    const pkgPath = path.join(dir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        if (pkg.name) {
          projectName = pkg.name;
        }

        framework = this.detectNodeFramework(pkg, dir, commandLine);
      } catch (err) {
        // malformed package.json
      }
    }

    // B. Check Python
    if (!framework) {
      framework = this.detectPythonFramework(dir, commandLine);
    }

    // C. Check PHP
    if (!framework) {
      framework = this.detectPhpFramework(dir, commandLine);
    }

    // D. Check Rust
    if (!framework) {
      if (fs.existsSync(path.join(dir, 'Cargo.toml'))) {
        try {
          const cargo = fs.readFileSync(path.join(dir, 'Cargo.toml'), 'utf-8');
          const nameMatch = cargo.match(/name\s*=\s*"([^"]+)"/);
          if (nameMatch) projectName = nameMatch[1];
          framework = {
            name: 'Rust',
            category: 'backend',
            packageManager: 'cargo',
            icon: 'rust'
          };
        } catch {}
      }
    }

    // E. Check Go
    if (!framework) {
      if (fs.existsSync(path.join(dir, 'go.mod'))) {
        try {
          const gomod = fs.readFileSync(path.join(dir, 'go.mod'), 'utf-8');
          const moduleMatch = gomod.match(/module\s+([^\s]+)/);
          if (moduleMatch) projectName = path.basename(moduleMatch[1]);
          framework = {
            name: 'Go',
            category: 'backend',
            packageManager: 'go',
            icon: 'go'
          };
        } catch {}
      }
    }

    // F. Check Java / Gradle / Maven
    if (!framework) {
      if (fs.existsSync(path.join(dir, 'pom.xml')) || fs.existsSync(path.join(dir, 'build.gradle'))) {
        framework = {
          name: 'Spring Boot',
          category: 'backend',
          packageManager: 'system',
          icon: 'java'
        };
      }
    }

    // G. Check Ruby
    if (!framework) {
      if (fs.existsSync(path.join(dir, 'Gemfile'))) {
        framework = {
          name: 'Ruby on Rails',
          category: 'fullstack',
          packageManager: 'system',
          icon: 'ruby'
        };
      }
    }

    // H. Check Docker Compose
    if (!framework) {
      if (fs.existsSync(path.join(dir, 'docker-compose.yml')) || fs.existsSync(path.join(dir, 'compose.yml'))) {
        framework = {
          name: 'Docker Compose',
          category: 'tool',
          packageManager: 'system',
          icon: 'docker'
        };
      }
    }

    return {
      projectPath: dir,
      projectName,
      framework
    };
  }

  private detectNodeFramework(pkg: any, dir: string, commandLine: string): FrameworkInfo {
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };

    let packageManager: FrameworkInfo['packageManager'] = 'npm';
    if (fs.existsSync(path.join(dir, 'pnpm-lock.yaml'))) packageManager = 'pnpm';
    else if (fs.existsSync(path.join(dir, 'yarn.lock'))) packageManager = 'yarn';
    else if (fs.existsSync(path.join(dir, 'bun.lockb')) || fs.existsSync(path.join(dir, 'bun.lock'))) packageManager = 'bun';
    else if (commandLine.includes('pnpm')) packageManager = 'pnpm';
    else if (commandLine.includes('yarn')) packageManager = 'yarn';
    else if (commandLine.includes('bun')) packageManager = 'bun';

    // Framework heuristics by priority
    if (deps['next'] || fs.existsSync(path.join(dir, 'next.config.js')) || fs.existsSync(path.join(dir, 'next.config.mjs')) || fs.existsSync(path.join(dir, 'next.config.ts'))) {
      return { name: 'Next.js', category: 'fullstack', packageManager, version: deps['next'], icon: 'nextjs' };
    }
    if (deps['nuxt'] || deps['nuxt3'] || fs.existsSync(path.join(dir, 'nuxt.config.js')) || fs.existsSync(path.join(dir, 'nuxt.config.ts'))) {
      return { name: 'Nuxt', category: 'fullstack', packageManager, version: deps['nuxt'] || deps['nuxt3'], icon: 'nuxt' };
    }
    if (deps['astro'] || fs.existsSync(path.join(dir, 'astro.config.mjs'))) {
      return { name: 'Astro', category: 'frontend', packageManager, version: deps['astro'], icon: 'astro' };
    }
    if (deps['@remix-run/react'] || deps['@remix-run/node'] || fs.existsSync(path.join(dir, 'remix.config.js'))) {
      return { name: 'Remix', category: 'fullstack', packageManager, version: deps['@remix-run/react'], icon: 'remix' };
    }
    if (deps['@sveltejs/kit'] || deps['svelte'] || fs.existsSync(path.join(dir, 'svelte.config.js'))) {
      return { name: 'Svelte', category: 'frontend', packageManager, version: deps['svelte'] || deps['@sveltejs/kit'], icon: 'svelte' };
    }
    if (deps['@angular/core'] || fs.existsSync(path.join(dir, 'angular.json'))) {
      return { name: 'Angular', category: 'frontend', packageManager, version: deps['@angular/core'], icon: 'angular' };
    }
    if (deps['vite'] || fs.existsSync(path.join(dir, 'vite.config.js')) || fs.existsSync(path.join(dir, 'vite.config.ts'))) {
      if (deps['vue']) return { name: 'Vite (Vue)', category: 'frontend', packageManager, version: deps['vite'], icon: 'vue' };
      if (deps['react']) return { name: 'Vite (React)', category: 'frontend', packageManager, version: deps['vite'], icon: 'react' };
      return { name: 'Vite', category: 'frontend', packageManager, version: deps['vite'], icon: 'vite' };
    }
    if (deps['@nestjs/core']) {
      return { name: 'NestJS', category: 'backend', packageManager, version: deps['@nestjs/core'], icon: 'nestjs' };
    }
    if (deps['express']) {
      return { name: 'Express', category: 'backend', packageManager, version: deps['express'], icon: 'express' };
    }
    if (deps['fastify']) {
      return { name: 'Fastify', category: 'backend', packageManager, version: deps['fastify'], icon: 'fastify' };
    }
    if (deps['hono']) {
      return { name: 'Hono', category: 'backend', packageManager, version: deps['hono'], icon: 'hono' };
    }
    if (deps['react'] || deps['react-dom']) {
      return { name: 'React', category: 'frontend', packageManager, version: deps['react'], icon: 'react' };
    }
    if (deps['vue']) {
      return { name: 'Vue', category: 'frontend', packageManager, version: deps['vue'], icon: 'vue' };
    }

    return { name: 'Node.js', category: 'backend', packageManager, icon: 'nodejs' };
  }

  private detectPythonFramework(dir: string, commandLine: string): FrameworkInfo | null {
    const isDjango = fs.existsSync(path.join(dir, 'manage.py')) || commandLine.includes('manage.py runserver');
    if (isDjango) return { name: 'Django', category: 'fullstack', packageManager: 'pip', icon: 'django' };

    const cmdLower = commandLine.toLowerCase();
    if (cmdLower.includes('fastapi') || cmdLower.includes('uvicorn')) {
      return { name: 'FastAPI', category: 'backend', packageManager: 'pip', icon: 'fastapi' };
    }
    if (cmdLower.includes('flask') || cmdLower.includes('gunicorn')) {
      return { name: 'Flask', category: 'backend', packageManager: 'pip', icon: 'flask' };
    }

    // Check pyproject.toml or requirements.txt
    const reqPath = path.join(dir, 'requirements.txt');
    if (fs.existsSync(reqPath)) {
      try {
        const text = fs.readFileSync(reqPath, 'utf-8').toLowerCase();
        if (text.includes('fastapi')) return { name: 'FastAPI', category: 'backend', packageManager: 'pip', icon: 'fastapi' };
        if (text.includes('flask')) return { name: 'Flask', category: 'backend', packageManager: 'pip', icon: 'flask' };
        if (text.includes('django')) return { name: 'Django', category: 'fullstack', packageManager: 'pip', icon: 'django' };
      } catch {}
    }

    if (fs.existsSync(path.join(dir, 'pyproject.toml')) || fs.existsSync(path.join(dir, 'setup.py'))) {
      return { name: 'Python', category: 'backend', packageManager: 'pip', icon: 'python' };
    }

    return null;
  }

  private detectPhpFramework(dir: string, commandLine: string): FrameworkInfo | null {
    if (fs.existsSync(path.join(dir, 'artisan')) || commandLine.includes('artisan serve')) {
      return { name: 'Laravel', category: 'fullstack', packageManager: 'composer', icon: 'laravel' };
    }
    if (fs.existsSync(path.join(dir, 'bin/console')) || fs.existsSync(path.join(dir, 'symfony.lock'))) {
      return { name: 'Symfony', category: 'backend', packageManager: 'composer', icon: 'symfony' };
    }
    if (fs.existsSync(path.join(dir, 'wp-config.php')) || fs.existsSync(path.join(dir, 'wp-content'))) {
      return { name: 'WordPress', category: 'fullstack', packageManager: 'composer', icon: 'wordpress' };
    }
    if (fs.existsSync(path.join(dir, 'composer.json')) || commandLine.includes('php -S')) {
      return { name: 'PHP', category: 'backend', packageManager: 'composer', icon: 'php' };
    }
    return null;
  }

  private detectDatabaseService(processName: string, commandLine: string, port: number): FrameworkInfo | null {
    const pName = processName.toLowerCase();
    const cmd = commandLine.toLowerCase();

    if (pName.includes('postgres') || cmd.includes('postgres') || port === 5432) {
      return { name: 'PostgreSQL', category: 'database', packageManager: 'system', icon: 'postgresql' };
    }
    if (pName.includes('redis') || cmd.includes('redis-server') || port === 6379) {
      return { name: 'Redis', category: 'database', packageManager: 'system', icon: 'redis' };
    }
    if (pName.includes('mongod') || cmd.includes('mongod') || port === 27017) {
      return { name: 'MongoDB', category: 'database', packageManager: 'system', icon: 'mongodb' };
    }
    if (pName.includes('mysql') || pName.includes('mariadb') || port === 3306) {
      return { name: 'MySQL', category: 'database', packageManager: 'system', icon: 'mysql' };
    }
    if (pName.includes('caddy') || cmd.includes('caddy')) {
      return { name: 'Caddy', category: 'tool', packageManager: 'system', icon: 'caddy' };
    }
    if (pName.includes('nginx') || cmd.includes('nginx')) {
      return { name: 'Nginx', category: 'tool', packageManager: 'system', icon: 'nginx' };
    }
    if (pName.includes('docker') || cmd.includes('com.docker')) {
      return { name: 'Docker', category: 'tool', packageManager: 'system', icon: 'docker' };
    }

    return null;
  }

  private detectFromCommandLine(commandLine: string, processName: string): ProjectDetectionResult {
    // The process name matters as much as the arguments here: a bare `python3` or
    // `node` with an unhelpful command line is still worth identifying.
    const cmd = `${commandLine} ${processName}`.toLowerCase();
    let framework: FrameworkInfo | null = null;

    if (cmd.includes('next')) framework = { name: 'Next.js', category: 'fullstack', packageManager: 'npm', icon: 'nextjs' };
    else if (cmd.includes('vite')) framework = { name: 'Vite', category: 'frontend', packageManager: 'npm', icon: 'vite' };
    else if (cmd.includes('uvicorn') || cmd.includes('fastapi')) framework = { name: 'FastAPI', category: 'backend', packageManager: 'pip', icon: 'fastapi' };
    else if (cmd.includes('flask')) framework = { name: 'Flask', category: 'backend', packageManager: 'pip', icon: 'flask' };
    else if (cmd.includes('artisan')) framework = { name: 'Laravel', category: 'fullstack', packageManager: 'composer', icon: 'laravel' };
    else if (cmd.includes('node')) framework = { name: 'Node.js', category: 'backend', packageManager: 'npm', icon: 'nodejs' };
    else if (cmd.includes('python')) framework = { name: 'Python', category: 'backend', packageManager: 'pip', icon: 'python' };

    return {
      projectPath: null,
      projectName: null,
      framework
    };
  }
}
