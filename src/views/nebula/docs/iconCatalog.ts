/**
 * Catalogo curato di Material Symbols Outlined per l'IconPicker di NEBULA-DOCS.
 *
 * Criteri di selezione:
 * - Solo icone con metafora ovvia (leggibili senza tooltip a 20px)
 * - Niente sentiment_x (sembrano emoji travestite)
 * - Niente chevron_x, expand_more, expand_less (vietati nel design language
 *   suite — vedi memoria feedback_no_chevrons)
 * - Niente food/animali/sport — non pertinenti a un documentale aziendale
 * - ~250 totali, divisi in 8 categorie semantiche
 *
 * Font caricato globalmente in index.html (link Google Fonts a Material
 * Symbols Outlined variable). Vedi docs/NEBULA-DOCS.md §7.
 */

export interface IconCategory {
  key: string
  label: string
  icons: string[]
}

export const ICON_CATEGORIES: IconCategory[] = [
  {
    key: 'lavoro',
    label: 'Lavoro',
    icons: [
      'work', 'work_outline', 'business_center', 'badge', 'apartment', 'store',
      'storefront', 'factory', 'engineering', 'construction', 'precision_manufacturing',
      'inventory_2', 'package_2', 'local_shipping', 'agriculture', 'meeting_room',
      'point_of_sale', 'monitoring', 'dashboard', 'analytics', 'leaderboard',
      'work_history', 'corporate_fare', 'cases', 'business', 'home_work',
      'inventory', 'category', 'conveyor_belt', 'lab_research',
    ],
  },
  {
    key: 'documenti',
    label: 'Documenti',
    icons: [
      'description', 'article', 'note', 'sticky_note_2', 'menu_book', 'auto_stories',
      'receipt_long', 'gavel', 'policy', 'folder', 'folder_open', 'folder_shared',
      'topic', 'snippet_folder', 'draft', 'edit_document', 'find_in_page',
      'picture_as_pdf', 'table_chart', 'attach_file', 'link', 'attachment',
      'history_edu', 'summarize', 'fact_check', 'post_add', 'source',
      'drive_file_rename_outline', 'difference', 'feed', 'newspaper',
      'request_page', 'docs', 'folder_copy', 'folder_zip',
    ],
  },
  {
    key: 'persone',
    label: 'Persone',
    icons: [
      'person', 'person_outline', 'group', 'groups', 'diversity_3', 'family_restroom',
      'support_agent', 'manage_accounts', 'admin_panel_settings', 'person_pin',
      'contacts', 'contact_mail', 'contact_phone', 'account_circle', 'supervisor_account',
      'group_add', 'person_add', 'switch_account', 'handshake', 'face',
      'co_present', 'recent_actors', 'workspace_premium', 'verified', 'partner_exchange',
    ],
  },
  {
    key: 'task',
    label: 'Task & Tempo',
    icons: [
      'task_alt', 'check_circle', 'pending', 'schedule', 'event', 'calendar_month',
      'today', 'date_range', 'alarm', 'timer', 'flag', 'priority_high',
      'low_priority', 'list_alt', 'checklist', 'done_all', 'format_list_bulleted',
      'format_list_numbered', 'playlist_add_check', 'radio_button_checked',
      'radio_button_unchecked', 'indeterminate_check_box', 'hourglass_top',
      'hourglass_bottom', 'pending_actions', 'more_time', 'alarm_on',
      'event_available', 'event_busy', 'event_note', 'event_repeat', 'update',
    ],
  },
  {
    key: 'spazio',
    label: 'Spazio',
    icons: [
      'rocket_launch', 'travel_explore', 'public', 'language', 'satellite_alt',
      'cell_tower', 'router', 'lan', 'dns', 'hub', 'share_location', 'my_location',
      'near_me', 'explore', 'terrain', 'landscape', 'dark_mode', 'light_mode',
      'nightlight', 'wb_sunny', 'wb_twilight', 'cloud', 'cloud_queue', 'flight',
      'place', 'map', 'location_on', 'pin_drop',
    ],
  },
  {
    key: 'comunicazione',
    label: 'Comunicazione',
    icons: [
      'chat', 'forum', 'campaign', 'mail', 'send', 'notifications', 'notifications_active',
      'phone', 'videocam', 'call', 'voicemail', 'sms', 'message', 'comment',
      'alternate_email', 'mark_email_read', 'mark_email_unread', 'mark_chat_unread',
      'drafts', 'inbox', 'outbox', 'forward_to_inbox', 'chat_bubble', 'chat_bubble_outline',
      'rss_feed', 'podcasts', 'record_voice_over', 'support', 'speaker_notes',
    ],
  },
  {
    key: 'finanza',
    label: 'Finanza',
    icons: [
      'payments', 'receipt', 'request_quote', 'savings', 'account_balance', 'euro',
      'attach_money', 'price_change', 'sell', 'shopping_cart', 'shopping_bag',
      'credit_card', 'account_balance_wallet', 'paid', 'sync_alt', 'redeem',
      'currency_exchange', 'percent', 'trending_up', 'trending_down', 'trending_flat',
      'show_chart', 'pie_chart', 'bar_chart', 'stacked_line_chart', 'calculate',
      'donut_large',
    ],
  },
  {
    key: 'generale',
    label: 'Generale',
    icons: [
      'home', 'star', 'star_outline', 'favorite', 'favorite_border', 'bookmark',
      'bookmark_border', 'label', 'label_important', 'lightbulb', 'tips_and_updates',
      'psychology', 'visibility', 'visibility_off', 'settings', 'tune', 'build',
      'handyman', 'search', 'filter_list', 'filter_alt', 'sort', 'refresh', 'sync',
      'history', 'undo', 'redo', 'content_copy', 'content_paste', 'save', 'delete',
      'archive', 'unarchive', 'lock', 'lock_open', 'key', 'shield', 'verified_user',
      'info', 'help', 'help_outline', 'warning', 'error', 'check', 'close', 'add',
      'remove', 'arrow_back', 'arrow_forward', 'north', 'south', 'east', 'west',
      'drag_indicator', 'more_horiz', 'more_vert', 'push_pin', 'brush', 'palette',
      'format_paint', 'format_bold', 'format_italic', 'format_underlined',
      'text_format', 'auto_awesome', 'celebration', 'emoji_objects',
    ],
  },
]

/** Lista piatta di tutti i nomi (per ricerca Fuse.js). */
export const ALL_ICONS: string[] = ICON_CATEGORIES.flatMap(c => c.icons)

/** Numero totale icone — utile per UI ("250 icone disponibili"). */
export const ICON_COUNT = ALL_ICONS.length

/**
 * Palette colore primario NEBULA + 4 tonal varianti (M3-ish) + neutri.
 * Usata dai color swatch del picker. Derivata dal primario #C46030.
 */
export const NEBULA_COLOR_PALETTE: { label: string; hex: string }[] = [
  { label: 'NEBULA primary', hex: '#C46030' },
  { label: 'NEBULA dark',    hex: '#8E4621' },
  { label: 'NEBULA mid',     hex: '#B85425' },
  { label: 'NEBULA tone+',   hex: '#D88153' },
  { label: 'NEBULA tone++',  hex: '#E8A57F' },
  { label: 'Neutro scuro',   hex: '#3A3A3A' },
  { label: 'Neutro medio',   hex: '#6B6B6B' },
  { label: 'Neutro chiaro',  hex: '#9E9E9E' },
]
