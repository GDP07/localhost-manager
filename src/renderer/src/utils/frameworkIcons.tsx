import React from 'react';
import {
  Boxes,
  Cog,
  Container,
  Database,
  FileCode2,
  Globe,
  LayoutTemplate,
  Server,
  Wrench
} from 'lucide-react';
import { FrameworkCategory } from '../../../shared/types/service';

/**
 * Frameworks are identified by name and glyph, not by colour. Colour in this app is
 * reserved for service state — a per-framework palette competes with it for attention
 * and turns a dense list into confetti.
 */
export function getFrameworkIcon(iconName?: string, className = 'h-3.5 w-3.5'): React.ReactNode {
  const name = (iconName || '').toLowerCase();

  if (['nextjs', 'nuxt', 'remix', 'astro', 'django', 'laravel', 'symfony', 'wordpress'].includes(name)) {
    return <Globe className={className} />;
  }
  if (['react', 'vue', 'svelte', 'angular', 'vite'].includes(name)) {
    return <LayoutTemplate className={className} />;
  }
  if (['postgresql', 'redis', 'mongodb', 'mysql'].includes(name)) {
    return <Database className={className} />;
  }
  if (name === 'docker') return <Container className={className} />;
  if (['nginx', 'caddy'].includes(name)) return <Wrench className={className} />;
  if (['nodejs', 'express', 'nestjs', 'fastify', 'hono'].includes(name)) {
    return <Boxes className={className} />;
  }
  if (['python', 'fastapi', 'flask'].includes(name)) return <FileCode2 className={className} />;
  if (['rust', 'go', 'java', 'php', 'ruby'].includes(name)) return <Cog className={className} />;

  return <Server className={className} />;
}

/** How a framework's role reads in prose — used for grouping and tooltips. */
export const CATEGORY_LABEL: Record<FrameworkCategory, string> = {
  frontend: 'Frontend',
  backend: 'Backend',
  fullstack: 'Full stack',
  database: 'Database',
  tool: 'Infrastructure',
  other: 'Other'
};
