import type { LitemetricsTheme } from '@litemetrics/ui';

interface ThemePreset {
  name: string;
  light: Required<LitemetricsTheme>;
  dark: Required<LitemetricsTheme>;
}

const PRESETS: ThemePreset[] = [
  {
    name: 'Default',
    light: {
      bg: '255 255 255', bgSecondary: '250 250 250', bgTertiary: '244 244 245',
      border: '228 228 231', borderHover: '212 212 216',
      text: '24 24 27', textSecondary: '113 113 122', textTertiary: '161 161 170', textMuted: '212 212 216',
      accent: '99 102 241', accentLight: '238 242 255', accentText: '67 56 202', accentHover: '129 140 248',
      positive: '5 150 105', negative: '239 68 68',
      chartStroke: '99 102 241', chartFill: '99 102 241', chartGrid: '244 244 245', chartAxis: '161 161 170',
      tooltipBg: '24 24 27', tooltipText: '255 255 255', tooltipMuted: '161 161 170',
      bar: '238 242 255', barHover: '224 231 255',
      pie1: '99 102 241', pie2: '139 92 246', pie3: '59 130 246', pie4: '20 184 166',
      pie5: '16 185 129', pie6: '245 158 11', pie7: '239 68 68', pie8: '236 72 153',
      mapEmpty: '244 244 245', mapStroke: '228 228 231', mapHover: '129 140 248',
    },
    dark: {
      bg: '24 24 27', bgSecondary: '39 39 42', bgTertiary: '63 63 70',
      border: '63 63 70', borderHover: '82 82 91',
      text: '244 244 245', textSecondary: '161 161 170', textTertiary: '113 113 122', textMuted: '82 82 91',
      accent: '129 140 248', accentLight: '30 27 75', accentText: '165 180 252', accentHover: '165 180 252',
      positive: '52 211 153', negative: '248 113 113',
      chartStroke: '129 140 248', chartFill: '129 140 248', chartGrid: '63 63 70', chartAxis: '113 113 122',
      tooltipBg: '244 244 245', tooltipText: '24 24 27', tooltipMuted: '113 113 122',
      bar: '30 27 75', barHover: '49 46 129',
      pie1: '129 140 248', pie2: '167 139 250', pie3: '96 165 250', pie4: '45 212 191',
      pie5: '52 211 153', pie6: '251 191 36', pie7: '248 113 113', pie8: '244 114 182',
      mapEmpty: '39 39 42', mapStroke: '63 63 70', mapHover: '165 180 252',
    },
  },
  {
    name: 'Ocean',
    light: {
      bg: '255 255 255', bgSecondary: '248 250 252', bgTertiary: '241 245 249',
      border: '226 232 240', borderHover: '203 213 225',
      text: '15 23 42', textSecondary: '100 116 139', textTertiary: '148 163 184', textMuted: '203 213 225',
      accent: '14 165 233', accentLight: '224 242 254', accentText: '3 105 161', accentHover: '56 189 248',
      positive: '5 150 105', negative: '239 68 68',
      chartStroke: '14 165 233', chartFill: '14 165 233', chartGrid: '241 245 249', chartAxis: '148 163 184',
      tooltipBg: '15 23 42', tooltipText: '255 255 255', tooltipMuted: '148 163 184',
      bar: '224 242 254', barHover: '186 230 253',
      pie1: '14 165 233', pie2: '6 182 212', pie3: '59 130 246', pie4: '99 102 241',
      pie5: '20 184 166', pie6: '245 158 11', pie7: '239 68 68', pie8: '168 85 247',
      mapEmpty: '241 245 249', mapStroke: '226 232 240', mapHover: '56 189 248',
    },
    dark: {
      bg: '15 23 42', bgSecondary: '30 41 59', bgTertiary: '51 65 85',
      border: '51 65 85', borderHover: '71 85 105',
      text: '241 245 249', textSecondary: '148 163 184', textTertiary: '100 116 139', textMuted: '71 85 105',
      accent: '56 189 248', accentLight: '12 74 110', accentText: '125 211 252', accentHover: '125 211 252',
      positive: '52 211 153', negative: '248 113 113',
      chartStroke: '56 189 248', chartFill: '56 189 248', chartGrid: '51 65 85', chartAxis: '100 116 139',
      tooltipBg: '241 245 249', tooltipText: '15 23 42', tooltipMuted: '100 116 139',
      bar: '12 74 110', barHover: '7 89 133',
      pie1: '56 189 248', pie2: '34 211 238', pie3: '96 165 250', pie4: '129 140 248',
      pie5: '45 212 191', pie6: '251 191 36', pie7: '248 113 113', pie8: '192 132 252',
      mapEmpty: '30 41 59', mapStroke: '51 65 85', mapHover: '125 211 252',
    },
  },
  {
    name: 'Emerald',
    light: {
      bg: '255 255 255', bgSecondary: '249 250 251', bgTertiary: '243 244 246',
      border: '229 231 235', borderHover: '209 213 219',
      text: '17 24 39', textSecondary: '107 114 128', textTertiary: '156 163 175', textMuted: '209 213 219',
      accent: '16 185 129', accentLight: '209 250 229', accentText: '4 120 87', accentHover: '52 211 153',
      positive: '16 185 129', negative: '239 68 68',
      chartStroke: '16 185 129', chartFill: '16 185 129', chartGrid: '243 244 246', chartAxis: '156 163 175',
      tooltipBg: '17 24 39', tooltipText: '255 255 255', tooltipMuted: '156 163 175',
      bar: '209 250 229', barHover: '167 243 208',
      pie1: '16 185 129', pie2: '20 184 166', pie3: '6 182 212', pie4: '59 130 246',
      pie5: '99 102 241', pie6: '245 158 11', pie7: '239 68 68', pie8: '236 72 153',
      mapEmpty: '243 244 246', mapStroke: '229 231 235', mapHover: '52 211 153',
    },
    dark: {
      bg: '17 24 39', bgSecondary: '31 41 55', bgTertiary: '55 65 81',
      border: '55 65 81', borderHover: '75 85 99',
      text: '243 244 246', textSecondary: '156 163 175', textTertiary: '107 114 128', textMuted: '75 85 99',
      accent: '52 211 153', accentLight: '6 78 59', accentText: '110 231 183', accentHover: '110 231 183',
      positive: '52 211 153', negative: '248 113 113',
      chartStroke: '52 211 153', chartFill: '52 211 153', chartGrid: '55 65 81', chartAxis: '107 114 128',
      tooltipBg: '243 244 246', tooltipText: '17 24 39', tooltipMuted: '107 114 128',
      bar: '6 78 59', barHover: '4 120 87',
      pie1: '52 211 153', pie2: '45 212 191', pie3: '34 211 238', pie4: '96 165 250',
      pie5: '129 140 248', pie6: '251 191 36', pie7: '248 113 113', pie8: '244 114 182',
      mapEmpty: '31 41 55', mapStroke: '55 65 81', mapHover: '110 231 183',
    },
  },
  {
    name: 'Rose',
    light: {
      bg: '255 255 255', bgSecondary: '255 251 251', bgTertiary: '255 241 242',
      border: '254 205 211', borderHover: '253 164 175',
      text: '26 12 18', textSecondary: '136 75 93', textTertiary: '190 130 148', textMuted: '228 182 195',
      accent: '244 63 94', accentLight: '255 228 230', accentText: '190 18 60', accentHover: '251 113 133',
      positive: '5 150 105', negative: '239 68 68',
      chartStroke: '244 63 94', chartFill: '244 63 94', chartGrid: '255 241 242', chartAxis: '190 130 148',
      tooltipBg: '26 12 18', tooltipText: '255 255 255', tooltipMuted: '190 130 148',
      bar: '255 228 230', barHover: '254 205 211',
      pie1: '244 63 94', pie2: '236 72 153', pie3: '168 85 247', pie4: '99 102 241',
      pie5: '14 165 233', pie6: '245 158 11', pie7: '239 68 68', pie8: '16 185 129',
      mapEmpty: '255 241 242', mapStroke: '254 205 211', mapHover: '251 113 133',
    },
    dark: {
      bg: '26 12 18', bgSecondary: '46 22 33', bgTertiary: '76 36 52',
      border: '76 36 52', borderHover: '110 50 72',
      text: '255 241 242', textSecondary: '190 130 148', textTertiary: '136 75 93', textMuted: '110 50 72',
      accent: '251 113 133', accentLight: '76 5 25', accentText: '253 164 175', accentHover: '253 164 175',
      positive: '52 211 153', negative: '248 113 113',
      chartStroke: '251 113 133', chartFill: '251 113 133', chartGrid: '76 36 52', chartAxis: '136 75 93',
      tooltipBg: '255 241 242', tooltipText: '26 12 18', tooltipMuted: '136 75 93',
      bar: '76 5 25', barHover: '110 18 42',
      pie1: '251 113 133', pie2: '244 114 182', pie3: '192 132 252', pie4: '129 140 248',
      pie5: '56 189 248', pie6: '251 191 36', pie7: '248 113 113', pie8: '52 211 153',
      mapEmpty: '46 22 33', mapStroke: '76 36 52', mapHover: '253 164 175',
    },
  },
  {
    name: 'Violet',
    light: {
      bg: '255 255 255', bgSecondary: '250 248 255', bgTertiary: '245 243 255',
      border: '221 214 254', borderHover: '196 181 253',
      text: '27 15 55', textSecondary: '107 83 150', textTertiary: '157 137 191', textMuted: '216 200 239',
      accent: '139 92 246', accentLight: '245 243 255', accentText: '109 40 217', accentHover: '167 139 250',
      positive: '5 150 105', negative: '239 68 68',
      chartStroke: '139 92 246', chartFill: '139 92 246', chartGrid: '245 243 255', chartAxis: '157 137 191',
      tooltipBg: '27 15 55', tooltipText: '255 255 255', tooltipMuted: '157 137 191',
      bar: '245 243 255', barHover: '237 233 254',
      pie1: '139 92 246', pie2: '168 85 247', pie3: '99 102 241', pie4: '236 72 153',
      pie5: '14 165 233', pie6: '245 158 11', pie7: '239 68 68', pie8: '16 185 129',
      mapEmpty: '245 243 255', mapStroke: '221 214 254', mapHover: '167 139 250',
    },
    dark: {
      bg: '27 15 55', bgSecondary: '46 28 84', bgTertiary: '68 44 116',
      border: '68 44 116', borderHover: '91 61 148',
      text: '245 243 255', textSecondary: '157 137 191', textTertiary: '107 83 150', textMuted: '91 61 148',
      accent: '167 139 250', accentLight: '46 16 101', accentText: '196 181 253', accentHover: '196 181 253',
      positive: '52 211 153', negative: '248 113 113',
      chartStroke: '167 139 250', chartFill: '167 139 250', chartGrid: '68 44 116', chartAxis: '107 83 150',
      tooltipBg: '245 243 255', tooltipText: '27 15 55', tooltipMuted: '107 83 150',
      bar: '46 16 101', barHover: '76 29 149',
      pie1: '167 139 250', pie2: '192 132 252', pie3: '129 140 248', pie4: '244 114 182',
      pie5: '56 189 248', pie6: '251 191 36', pie7: '248 113 113', pie8: '52 211 153',
      mapEmpty: '46 28 84', mapStroke: '68 44 116', mapHover: '196 181 253',
    },
  },
  {
    name: 'Amber',
    light: {
      bg: '255 255 255', bgSecondary: '255 251 235', bgTertiary: '254 243 199',
      border: '253 230 138', borderHover: '252 211 77',
      text: '41 37 36', textSecondary: '120 113 108', textTertiary: '168 162 158', textMuted: '214 211 209',
      accent: '217 119 6', accentLight: '254 243 199', accentText: '146 64 14', accentHover: '245 158 11',
      positive: '5 150 105', negative: '239 68 68',
      chartStroke: '217 119 6', chartFill: '217 119 6', chartGrid: '254 243 199', chartAxis: '168 162 158',
      tooltipBg: '41 37 36', tooltipText: '255 255 255', tooltipMuted: '168 162 158',
      bar: '254 243 199', barHover: '253 230 138',
      pie1: '217 119 6', pie2: '234 88 12', pie3: '245 158 11', pie4: '16 185 129',
      pie5: '59 130 246', pie6: '139 92 246', pie7: '239 68 68', pie8: '236 72 153',
      mapEmpty: '254 243 199', mapStroke: '253 230 138', mapHover: '245 158 11',
    },
    dark: {
      bg: '28 25 23', bgSecondary: '41 37 36', bgTertiary: '68 64 60',
      border: '68 64 60', borderHover: '87 83 78',
      text: '250 250 249', textSecondary: '168 162 158', textTertiary: '120 113 108', textMuted: '87 83 78',
      accent: '245 158 11', accentLight: '69 26 3', accentText: '252 211 77', accentHover: '252 211 77',
      positive: '52 211 153', negative: '248 113 113',
      chartStroke: '245 158 11', chartFill: '245 158 11', chartGrid: '68 64 60', chartAxis: '120 113 108',
      tooltipBg: '250 250 249', tooltipText: '28 25 23', tooltipMuted: '120 113 108',
      bar: '69 26 3', barHover: '120 53 15',
      pie1: '245 158 11', pie2: '249 115 22', pie3: '252 211 77', pie4: '52 211 153',
      pie5: '96 165 250', pie6: '167 139 250', pie7: '248 113 113', pie8: '244 114 182',
      mapEmpty: '41 37 36', mapStroke: '68 64 60', mapHover: '252 211 77',
    },
  },
  {
    name: 'Crimson',
    light: {
      bg: '255 255 255', bgSecondary: '254 249 249', bgTertiary: '254 242 242',
      border: '252 211 211', borderHover: '248 180 180',
      text: '30 15 15', textSecondary: '127 78 78', textTertiary: '178 128 128', textMuted: '220 190 190',
      accent: '220 38 38', accentLight: '254 226 226', accentText: '185 28 28', accentHover: '248 113 113',
      positive: '5 150 105', negative: '220 38 38',
      chartStroke: '220 38 38', chartFill: '220 38 38', chartGrid: '254 242 242', chartAxis: '178 128 128',
      tooltipBg: '30 15 15', tooltipText: '255 255 255', tooltipMuted: '178 128 128',
      bar: '254 226 226', barHover: '254 202 202',
      pie1: '220 38 38', pie2: '239 68 68', pie3: '234 88 12', pie4: '245 158 11',
      pie5: '59 130 246', pie6: '139 92 246', pie7: '16 185 129', pie8: '236 72 153',
      mapEmpty: '254 242 242', mapStroke: '252 211 211', mapHover: '248 113 113',
    },
    dark: {
      bg: '30 15 15', bgSecondary: '50 25 25', bgTertiary: '80 38 38',
      border: '80 38 38', borderHover: '110 52 52',
      text: '254 242 242', textSecondary: '178 128 128', textTertiary: '127 78 78', textMuted: '110 52 52',
      accent: '248 113 113', accentLight: '69 10 10', accentText: '252 165 165', accentHover: '252 165 165',
      positive: '52 211 153', negative: '248 113 113',
      chartStroke: '248 113 113', chartFill: '248 113 113', chartGrid: '80 38 38', chartAxis: '127 78 78',
      tooltipBg: '254 242 242', tooltipText: '30 15 15', tooltipMuted: '127 78 78',
      bar: '69 10 10', barHover: '127 29 29',
      pie1: '248 113 113', pie2: '251 146 60', pie3: '252 211 77', pie4: '96 165 250',
      pie5: '167 139 250', pie6: '52 211 153', pie7: '244 114 182', pie8: '253 186 116',
      mapEmpty: '50 25 25', mapStroke: '80 38 38', mapHover: '252 165 165',
    },
  },
  {
    name: 'Teal',
    light: {
      bg: '255 255 255', bgSecondary: '247 254 254', bgTertiary: '240 253 250',
      border: '204 251 241', borderHover: '153 246 228',
      text: '19 30 30', textSecondary: '94 117 117', textTertiary: '143 166 166', textMuted: '198 219 219',
      accent: '20 184 166', accentLight: '204 251 241', accentText: '13 148 136', accentHover: '45 212 191',
      positive: '20 184 166', negative: '239 68 68',
      chartStroke: '20 184 166', chartFill: '20 184 166', chartGrid: '240 253 250', chartAxis: '143 166 166',
      tooltipBg: '19 30 30', tooltipText: '255 255 255', tooltipMuted: '143 166 166',
      bar: '204 251 241', barHover: '153 246 228',
      pie1: '20 184 166', pie2: '6 182 212', pie3: '14 165 233', pie4: '59 130 246',
      pie5: '16 185 129', pie6: '245 158 11', pie7: '239 68 68', pie8: '168 85 247',
      mapEmpty: '240 253 250', mapStroke: '204 251 241', mapHover: '45 212 191',
    },
    dark: {
      bg: '19 30 30', bgSecondary: '32 48 48', bgTertiary: '50 72 72',
      border: '50 72 72', borderHover: '68 95 95',
      text: '240 253 250', textSecondary: '143 166 166', textTertiary: '94 117 117', textMuted: '68 95 95',
      accent: '45 212 191', accentLight: '17 94 89', accentText: '94 234 212', accentHover: '94 234 212',
      positive: '52 211 153', negative: '248 113 113',
      chartStroke: '45 212 191', chartFill: '45 212 191', chartGrid: '50 72 72', chartAxis: '94 117 117',
      tooltipBg: '240 253 250', tooltipText: '19 30 30', tooltipMuted: '94 117 117',
      bar: '17 94 89', barHover: '15 118 110',
      pie1: '45 212 191', pie2: '34 211 238', pie3: '56 189 248', pie4: '96 165 250',
      pie5: '52 211 153', pie6: '251 191 36', pie7: '248 113 113', pie8: '192 132 252',
      mapEmpty: '32 48 48', mapStroke: '50 72 72', mapHover: '94 234 212',
    },
  },
  {
    name: 'Slate',
    light: {
      bg: '255 255 255', bgSecondary: '248 250 252', bgTertiary: '241 245 249',
      border: '226 232 240', borderHover: '203 213 225',
      text: '15 23 42', textSecondary: '100 116 139', textTertiary: '148 163 184', textMuted: '203 213 225',
      accent: '71 85 105', accentLight: '241 245 249', accentText: '30 41 59', accentHover: '100 116 139',
      positive: '5 150 105', negative: '239 68 68',
      chartStroke: '71 85 105', chartFill: '71 85 105', chartGrid: '241 245 249', chartAxis: '148 163 184',
      tooltipBg: '15 23 42', tooltipText: '255 255 255', tooltipMuted: '148 163 184',
      bar: '241 245 249', barHover: '226 232 240',
      pie1: '71 85 105', pie2: '100 116 139', pie3: '59 130 246', pie4: '99 102 241',
      pie5: '20 184 166', pie6: '245 158 11', pie7: '239 68 68', pie8: '168 85 247',
      mapEmpty: '241 245 249', mapStroke: '226 232 240', mapHover: '100 116 139',
    },
    dark: {
      bg: '15 23 42', bgSecondary: '30 41 59', bgTertiary: '51 65 85',
      border: '51 65 85', borderHover: '71 85 105',
      text: '241 245 249', textSecondary: '148 163 184', textTertiary: '100 116 139', textMuted: '71 85 105',
      accent: '148 163 184', accentLight: '30 41 59', accentText: '203 213 225', accentHover: '203 213 225',
      positive: '52 211 153', negative: '248 113 113',
      chartStroke: '148 163 184', chartFill: '148 163 184', chartGrid: '51 65 85', chartAxis: '100 116 139',
      tooltipBg: '241 245 249', tooltipText: '15 23 42', tooltipMuted: '100 116 139',
      bar: '30 41 59', barHover: '51 65 85',
      pie1: '148 163 184', pie2: '129 140 248', pie3: '96 165 250', pie4: '45 212 191',
      pie5: '52 211 153', pie6: '251 191 36', pie7: '248 113 113', pie8: '192 132 252',
      mapEmpty: '30 41 59', mapStroke: '51 65 85', mapHover: '203 213 225',
    },
  },
  {
    name: 'Sunset',
    light: {
      bg: '255 255 255', bgSecondary: '255 251 245', bgTertiary: '255 247 237',
      border: '254 215 170', borderHover: '253 186 116',
      text: '36 22 12', textSecondary: '130 90 55', textTertiary: '178 138 100', textMuted: '218 192 165',
      accent: '234 88 12', accentLight: '255 237 213', accentText: '194 65 12', accentHover: '249 115 22',
      positive: '5 150 105', negative: '239 68 68',
      chartStroke: '234 88 12', chartFill: '234 88 12', chartGrid: '255 247 237', chartAxis: '178 138 100',
      tooltipBg: '36 22 12', tooltipText: '255 255 255', tooltipMuted: '178 138 100',
      bar: '255 237 213', barHover: '254 215 170',
      pie1: '234 88 12', pie2: '217 119 6', pie3: '244 63 94', pie4: '236 72 153',
      pie5: '59 130 246', pie6: '139 92 246', pie7: '16 185 129', pie8: '245 158 11',
      mapEmpty: '255 247 237', mapStroke: '254 215 170', mapHover: '249 115 22',
    },
    dark: {
      bg: '36 22 12', bgSecondary: '55 35 20', bgTertiary: '80 50 30',
      border: '80 50 30', borderHover: '110 68 40',
      text: '255 247 237', textSecondary: '178 138 100', textTertiary: '130 90 55', textMuted: '110 68 40',
      accent: '249 115 22', accentLight: '80 32 8', accentText: '253 186 116', accentHover: '253 186 116',
      positive: '52 211 153', negative: '248 113 113',
      chartStroke: '249 115 22', chartFill: '249 115 22', chartGrid: '80 50 30', chartAxis: '130 90 55',
      tooltipBg: '255 247 237', tooltipText: '36 22 12', tooltipMuted: '130 90 55',
      bar: '80 32 8', barHover: '124 45 18',
      pie1: '249 115 22', pie2: '245 158 11', pie3: '251 113 133', pie4: '244 114 182',
      pie5: '96 165 250', pie6: '167 139 250', pie7: '52 211 153', pie8: '252 211 77',
      mapEmpty: '55 35 20', mapStroke: '80 50 30', mapHover: '253 186 116',
    },
  },
];

// Extract preview colors from a preset for the swatch display
function getPreviewColors(preset: ThemePreset, isDark: boolean) {
  const t = isDark ? preset.dark : preset.light;
  return {
    bg: `rgb(${t.bg.replace(/ /g, ', ')})`,
    accent: `rgb(${t.accent.replace(/ /g, ', ')})`,
    accentHover: `rgb(${t.accentHover.replace(/ /g, ', ')})`,
    text: `rgb(${t.text.replace(/ /g, ', ')})`,
    border: `rgb(${t.border.replace(/ /g, ', ')})`,
  };
}

interface ThemeEditorProps {
  dark: boolean;
  activePreset: string | null;
  onSelect: (name: string, light: Required<LitemetricsTheme>, dark: Required<LitemetricsTheme>) => void;
  onReset: () => void;
  onToggleDark: () => void;
}

export { PRESETS };

export function ThemeEditor({ dark, activePreset, onSelect, onReset, onToggleDark }: ThemeEditorProps) {
  return (
    <div className={`mb-6 rounded-xl border overflow-hidden transition-colors ${
      dark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'
    }`}>
      {/* Header */}
      <div className={`px-4 py-3 flex items-center justify-between border-b ${
        dark ? 'border-zinc-800' : 'border-zinc-100'
      }`}>
        <div className="flex items-center gap-2">
          <svg className={`w-4 h-4 ${dark ? 'text-zinc-400' : 'text-zinc-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
          </svg>
          <span className={`text-sm font-medium ${dark ? 'text-zinc-200' : 'text-zinc-700'}`}>
            Theme
          </span>
          {activePreset && activePreset !== 'Default' && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-500">
              {activePreset}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Light/Dark toggle */}
          <button
            onClick={onToggleDark}
            className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border transition-colors ${
              dark
                ? 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700'
                : 'bg-zinc-50 border-zinc-200 text-zinc-600 hover:bg-zinc-100'
            }`}
          >
            {dark ? (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            )}
            {dark ? 'Dark' : 'Light'}
          </button>
          {activePreset && activePreset !== 'Default' && (
            <button
              onClick={onReset}
              className={`text-xs px-2 py-1 rounded transition-colors ${
                dark ? 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800' : 'text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50'
              }`}
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Preset Grid */}
      <div className="p-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {PRESETS.map((preset) => {
            const isActive = activePreset === preset.name || (!activePreset && preset.name === 'Default');
            const colors = getPreviewColors(preset, dark);
            return (
              <button
                key={preset.name}
                onClick={() => onSelect(preset.name, preset.light, preset.dark)}
                className={`group relative rounded-lg border-2 p-3 transition-all text-left ${
                  isActive
                    ? 'border-indigo-500 shadow-md shadow-indigo-500/10'
                    : dark
                      ? 'border-zinc-700 hover:border-zinc-600'
                      : 'border-zinc-200 hover:border-zinc-300'
                }`}
              >
                {/* Preview mini dashboard */}
                <div
                  className="rounded-md p-2 mb-2 space-y-1.5"
                  style={{ backgroundColor: colors.bg, border: `1px solid ${colors.border}` }}
                >
                  {/* Mini chart line */}
                  <div className="flex items-end gap-px h-5">
                    {[3, 5, 4, 7, 6, 8, 5].map((h, i) => (
                      <div
                        key={i}
                        className="flex-1 rounded-sm"
                        style={{
                          height: `${(h / 8) * 100}%`,
                          backgroundColor: colors.accent,
                          opacity: 0.2 + (i / 7) * 0.8,
                        }}
                      />
                    ))}
                  </div>
                  {/* Mini bar rows */}
                  <div className="space-y-0.5">
                    {[80, 55, 35].map((w, i) => (
                      <div key={i} className="flex gap-1 items-center">
                        <div
                          className="h-1.5 rounded-full"
                          style={{ width: `${w}%`, backgroundColor: colors.accent, opacity: 0.25 }}
                        />
                        <div className="h-1 w-3 rounded-full" style={{ backgroundColor: colors.text, opacity: 0.2 }} />
                      </div>
                    ))}
                  </div>
                </div>
                {/* Label */}
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-medium ${dark ? 'text-zinc-300' : 'text-zinc-600'}`}>
                    {preset.name}
                  </span>
                  {/* Color dots */}
                  <div className="flex -space-x-1">
                    <div className="w-3 h-3 rounded-full border border-white/50" style={{ backgroundColor: colors.accent }} />
                    <div className="w-3 h-3 rounded-full border border-white/50" style={{ backgroundColor: colors.accentHover }} />
                  </div>
                </div>
                {/* Active check */}
                {isActive && (
                  <div className="absolute top-1.5 right-1.5 w-4 h-4 bg-indigo-500 rounded-full flex items-center justify-center">
                    <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
