import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Cloud Functions는 자체 tsconfig/빌드를 갖는 별도 패키지 (lib/=컴파일 산출물)
    "functions/**",
  ]),
  {
    rules: {
      // 마운트 시 Firestore 조회(fetch-on-mount) 패턴 허용 —
      // setState는 await 이후 비동기로 호출되며, 데이터 라이브러리 도입 전까지 표준 패턴
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);

export default eslintConfig;
