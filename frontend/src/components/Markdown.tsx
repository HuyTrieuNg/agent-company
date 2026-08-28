"use client";

import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import rehypeRaw from "rehype-raw";

interface MarkdownProps {
  content: string;
}

function Markdown({ content }: MarkdownProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeHighlight, rehypeRaw]}
      components={{
        h1: ({ children, ...props }) => (
          <h1 className="text-xl font-bold leading-snug mt-5 mb-2 text-(--text-primary)" {...props}>
            {children}
          </h1>
        ),
        h2: ({ children, ...props }) => (
          <h2 className="text-lg font-bold leading-snug mt-5 mb-2 text-(--text-primary)" {...props}>
            {children}
          </h2>
        ),
        h3: ({ children, ...props }) => (
          <h3 className="text-base font-bold leading-snug mt-5 mb-2 text-(--text-primary)" {...props}>
            {children}
          </h3>
        ),
        p: ({ children, ...props }) => (
          <p className="mb-3 last:mb-0 text-sm leading-[1.7] text-(--text-primary)" {...props}>
            {children}
          </p>
        ),
        ul: ({ children, ...props }) => (
          <ul className="list-disc pl-6 mb-3 text-sm text-(--text-primary)" {...props}>
            {children}
          </ul>
        ),
        ol: ({ children, ...props }) => (
          <ol className="list-decimal pl-6 mb-3 text-sm text-(--text-primary)" {...props}>
            {children}
          </ol>
        ),
        li: ({ children, ...props }) => (
          <li className="mb-1 text-(--text-primary)" {...props}>
            {children}
          </li>
        ),
        code: ({ className, children, ...props }) => {
          const isInline = !className;
          return isInline ? (
            <code className="bg-(--bg-subtle) border border-(--border-default) text-(--text-primary) px-1.5 py-0.5 rounded text-[0.88em] font-mono" {...props}>
              {children}
            </code>
          ) : (
            <code className={`${className} font-mono text-[13px] leading-1.6 text-(--text-primary) bg-transparent border-none p-0`} {...props}>
              {children}
            </code>
          );
        },
        pre: ({ children, ...props }) => (
          <pre className="bg-(--bg-subtle) border border-(--border-default) rounded-lg p-3.5 my-3 overflow-x-auto font-mono text-[13px] leading-relaxed text-(--text-primary)" {...props}>
            {children}
          </pre>
        ),
        blockquote: ({ children, ...props }) => (
          <blockquote className="border-l-2 border-(--action-primary) pl-3 my-3 text-(--text-secondary) italic" {...props}>
            {children}
          </blockquote>
        ),
        table: ({ children, ...props }) => (
          <div className="overflow-x-auto my-3">
            <table className="w-full border-collapse text-[13px] border border-(--border-default)" {...props}>
              {children}
            </table>
          </div>
        ),
        th: ({ children, ...props }) => (
          <th className="bg-(--bg-subtle) text-(--text-primary) font-semibold p-2 px-3 text-left border border-(--border-default)" {...props}>
            {children}
          </th>
        ),
        td: ({ children, ...props }) => (
          <td className="p-2 px-3 border border-(--border-default) text-(--text-secondary) tabular-nums" {...props}>
            {children}
          </td>
        ),
        tr: ({ children, ...props }) => (
          <tr className="even:bg-(--bg-subtle)/40" {...props}>
            {children}
          </tr>
        ),
        hr: ({ ...props }) => (
          <hr className="border-none border-t border-(--border-default) my-4" {...props} />
        ),
        a: ({ href, children, ...props }) => (
          <a href={href} target="_blank" rel="noopener noreferrer" className="text-(--action-primary) underline underline-offset-2 hover:text-(--action-primary-hover)" {...props}>
            {children}
          </a>
        ),
        strong: ({ children, ...props }) => (
          <strong className="text-(--text-primary) font-bold" {...props}>
            {children}
          </strong>
        ),
        em: ({ children, ...props }) => (
          <em className="text-(--text-secondary) italic" {...props}>
            {children}
          </em>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

export default memo(Markdown);
