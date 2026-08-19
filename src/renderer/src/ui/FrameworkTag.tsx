import React from 'react';
import { FrameworkInfo } from '../../../shared/types/service';
import { getFrameworkIcon } from '../utils/frameworkIcons';
import { Badge } from './Badge';

/** Framework identity, or the bare protocol when detection found nothing. */
export const FrameworkTag: React.FC<{
  framework: FrameworkInfo | null;
  protocol?: string;
}> = ({ framework, protocol }) => {
  if (!framework) {
    return protocol ? (
      <Badge mono className="uppercase">
        {protocol}
      </Badge>
    ) : null;
  }

  return (
    <Badge
      className="text-muted"
      // The version is useful but secondary — it belongs in the tooltip, not the label.
      >
      {getFrameworkIcon(framework.icon, 'h-3 w-3 shrink-0')}
      <span
        className="truncate"
        title={framework.version ? `${framework.name} ${framework.version}` : framework.name}
      >
        {framework.name}
      </span>
    </Badge>
  );
};
