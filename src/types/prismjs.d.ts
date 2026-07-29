/**
 * prismjs는 타입 정의를 함께 배포하지 않는다.
 * 퀴즈의 코드 시나리오를 런타임에 하이라이팅할 때 쓰는 최소한만 선언한다.
 */
declare module 'prismjs' {
  export type Grammar = Record<string, unknown>

  const Prism: {
    languages: Record<string, Grammar | undefined>
    highlight(code: string, grammar: Grammar, language: string): string
  }

  export default Prism
}

declare module 'prismjs/components/prism-sql'
declare module 'prismjs/components/prism-python'
declare module 'prismjs/components/prism-bash'
declare module 'prismjs/components/prism-yaml'
