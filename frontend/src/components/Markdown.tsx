"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import rehypeRaw from "rehype-raw";

interface MarkdownProps {
  content: string;
}

export default function Markdown({ content }: MarkdownProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeHighlight, rehypeRaw]}
      components={{
        h1: ({ children, ...props }) => (
          <h1 className="text-xl font-bold leading-snug mt-5 mb-2 text-slate-50" {...props}>
            {children}
          </h1>
        ),
        h2: ({ children, ...props }) => (
          <h2 className="text-lg font-bold leading-snug mt-5 mb-2 text-slate-50" {...props}>
            {children}
          </h2>
        ),
        h3: ({ children, ...props }) => (
          <h3 className="text-base font-bold leading-snug mt-5 mb-2 text-slate-50" {...props}>
            {children}
          </h3>
        ),
        p: ({ children, ...props }) => (
          <p className="mb-3 last:mb-0 text-sm leading-[1.7]" {...props}>
            {children}
          </p>
        ),
        ul: ({ children, ...props }) => (
          <ul className="list-disc pl-6 mb-3 text-sm" {...props}>
            {children}
          </ul>
        ),
        ol: ({ children, ...props }) => (
          <ol className="list-decimal pl-6 mb-3 text-sm" {...props}>
            {children}
          </ol>
        ),
        li: ({ children, ...props }) => (
          <li className="mb-1" {...props}>
            {children}
          </li>
        ),
        code: ({ className, children, ...props }) => {
          const isInline = !className;
          return isInline ? (
            <code className="bg-[#8b5cf6]/15 border border-[#8b5cf6]/25 text-[#c4b5fd] px-1.5 py-0.5 rounded text-[0.88em] font-mono" {...props}>
              {children}
            </code>
          ) : (
            <code className={`${className} font-mono text-[13px] leading-1.6 text-[#e2e8f0] bg-transparent border-none p-0`} {...props}>
              {children}
            </code>
          );
        },
        pre: ({ children, ...props }) => (
          <pre className="bg-black/45 border border-white/8 rounded-xl p-3.5 my-3 overflow-x-auto font-mono text-[13px] leading-relaxed text-slate-200" {...props}>
            {children}
          </pre>
        ),
        blockquote: ({ children, ...props }) => (
          <blockquote className="border-l-[3px] border-[#8b5cf6] pl-3 my-3 text-slate-500 italic" {...props}>
            {children}
          </blockquote>
        ),
        table: ({ children, ...props }) => (
          <table className="w-full border-collapse text-[13px] my-3 border border-white/8" {...props}>
            {children}
          </table>
        ),
        th: ({ children, ...props }) => (
          <th className="bg-[#8b5cf6]/10 text-[#c4b5fd] font-semibold p-2 px-3 text-left border border-white/8" {...props}>
            {children}
          </th>
        ),
        td: ({ children, ...props }) => (
          <td className="p-2 px-3 border border-white/8 text-slate-300" {...props}>
            {children}
          </td>
        ),
        tr: ({ children, ...props }) => (
          <tr className="even:bg-white/2" {...props}>
            {children}
          </tr>
        ),
        hr: ({ ...props }) => (
          <hr className="border-none border-t border-white/8 my-4" {...props} />
        ),
        a: ({ href, children, ...props }) => (
          <a href={href} target="_blank" rel="noopener noreferrer" className="text-[#a78bfa] underline underline-offset-2 hover:text-[#c4b5fd]" {...props}>
            {children}
          </a>
        ),
        strong: ({ children, ...props }) => (
          <strong className="text-slate-50 font-bold" {...props}>
            {children}
          </strong>
        ),
        em: ({ children, ...props }) => (
          <em className="text-slate-300 italic" {...props}>
            {children}
          </em>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
