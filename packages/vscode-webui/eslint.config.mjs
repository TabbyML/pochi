// eslint.config.mjs
import i18next from 'eslint-plugin-i18next';
import typescriptParser from '@typescript-eslint/parser';

export default [
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true
        }
      }
    },
    plugins: {
      i18next
    },
    rules: {
      'i18next/no-literal-string': ['error', {
        markupOnly: true, // 只检查 JSX 标记中的字符串
        ignoreAttribute: [
          'className', 'style', 'key', 'id', 'data-*', 'aria-*', 'role', 
          'type', 'name', 'value', 'placeholder', 'alt', 'title', 'href', 
          'src', 'for', 'htmlFor', 'width', 'height', 'viewBox', 'fill',
          'stroke', 'strokeWidth', 'strokeLinecap', 'strokeLinejoin'
        ],
        ignoreCallee: [
          'console.log', 'console.error', 'console.warn', 'console.info', 
          'console.debug', 'require', 'import', 'setTimeout', 'setInterval'
        ],
        ignoreProperty: [
          'displayName', 'propTypes', 'defaultProps', 'contextTypes'
        ],
        words: {
          exclude: [
            // HTML 标签
            'div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 
            'button', 'input', 'textarea', 'select', 'option', 'label', 
            'form', 'table', 'tr', 'td', 'th', 'thead', 'tbody', 'tfoot', 
            'ul', 'ol', 'li', 'nav', 'header', 'footer', 'main', 'section', 
            'article', 'aside', 'figure', 'figcaption', 'img', 'a', 'strong', 
            'em', 'code', 'pre', 'blockquote', 'hr', 'br',
            // 常见的技术术语和单位
            'px', 'rem', 'em', '%', 'vh', 'vw', 'auto', 'none', 'inherit',
            'KB', 'MB', 'GB', 'ms', 's', 'min', 'h',
            // 常见的状态和方向
            'left', 'right', 'top', 'bottom', 'center', 'start', 'end',
            'true', 'false', 'null', 'undefined',
            // 常见符号和单字符
            '@', '/', '\\', '|', '-', '_', '+', '=', ':', ';', ',', '.', 
            '?', '!', '#', '$', '%', '&', '*', '(', ')', '[', ']', '{', '}',
            '<', '>', '"', "'", '`', '~', '^'
          ]
        }
      }]
    }
  },
  {
    files: ['**/*.test.{js,jsx,ts,tsx}', '**/*.spec.{js,jsx,ts,tsx}', '**/*.story.{js,jsx,ts,tsx}', '**/*.stories.{js,jsx,ts,tsx}'],
    rules: {
      'i18next/no-literal-string': 'off' // 在测试和故事文件中禁用此规则
    }
  }
];