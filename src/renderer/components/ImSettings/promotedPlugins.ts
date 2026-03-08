/**
 * Promoted Plugins — community plugins that get first-class UI treatment.
 *
 * These are technically OpenClaw Channel Plugins (running via Plugin Bridge),
 * but displayed as built-in platforms with custom icons, branding, and setup guidance.
 */

import qqbotIcon from './assets/qqbot.svg';

export interface PromotedPlugin {
    /** Plugin ID — must match InstalledPlugin.pluginId after installation */
    pluginId: string;
    /** npm package spec for auto-install */
    npmSpec: string;
    /** Display name */
    name: string;
    /** Short description shown on platform card */
    description: string;
    /** Icon asset (imported image path) */
    icon: string;
    /** Brand color for badges and accents */
    platformColor: string;
    /** Custom setup guidance for the wizard config step */
    setupGuide?: {
        /** Section title in config panel (e.g. "QQ Bot 应用凭证") */
        credentialTitle: string;
        /** Helper text above config inputs */
        credentialHint: string;
    };
}

export const PROMOTED_PLUGINS: PromotedPlugin[] = [
    {
        pluginId: 'qqbot',
        // TODO: update to actual published package name before release
        npmSpec: 'openclaw-channel-qqbot',
        name: 'QQ Bot',
        description: '通过 QQ Bot 远程使用 AI Agent',
        icon: qqbotIcon,
        platformColor: '#12B7F5',
        setupGuide: {
            credentialTitle: 'QQ Bot 应用凭证',
            credentialHint: '前往 QQ 开放平台创建应用，获取 AppID 和 AppSecret',
        },
    },
];

/** Find a promoted plugin definition by pluginId */
export function findPromotedPlugin(pluginId: string | undefined): PromotedPlugin | undefined {
    if (!pluginId) return undefined;
    return PROMOTED_PLUGINS.find(p => p.pluginId === pluginId);
}

/** Find a promoted plugin by platform string (e.g. "openclaw:qqbot") */
export function findPromotedByPlatform(platform: string): PromotedPlugin | undefined {
    if (!platform.startsWith('openclaw:')) return undefined;
    const channelId = platform.slice('openclaw:'.length);
    return PROMOTED_PLUGINS.find(p => p.pluginId === channelId);
}
