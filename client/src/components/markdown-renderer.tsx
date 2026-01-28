import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";

interface MarkdownRendererProps {
  content: string;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <div className="text-sm text-foreground/90 markdown-content">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ node, inline, className, children, ...props }: any) {
            const match = /language-(\w+)/.exec(className || "");
            return !inline && match ? (
              <div className="my-3 w-full">
                <div className="rounded-lg border bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 shadow-sm overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2 border-b bg-slate-100/50 dark:bg-slate-800/50">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      {match[1] === "markdown" ? "📝 System Prompt" : match[1]}
                    </span>
                  </div>
                  <pre
                    className="p-4 text-sm overflow-x-auto"
                    style={{
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      overflowWrap: "break-word"
                    }}
                  >
                    <code className="text-foreground font-mono" {...props}>
                      {String(children).replace(/\n$/, "")}
                    </code>
                  </pre>
                </div>
              </div>
            ) : (
              <code
                className={`${className} bg-muted px-1.5 py-0.5 rounded-md font-mono text-sm`}
                {...props}
              >
                {children}
              </code>
            );
          },
          ul({ children }) {
            return <ul className="list-disc pl-4 space-y-1 my-2">{children}</ul>;
          },
          ol({ children }) {
            return <ol className="list-decimal pl-4 space-y-1 my-2">{children}</ol>;
          },
          li({ children }) {
            return <li className="leading-relaxed">{children}</li>;
          },
          p({ children }) {
            return <p className="leading-relaxed mb-2 last:mb-0">{children}</p>;
          },
          strong({ children }) {
            return <strong className="font-bold text-foreground">{children}</strong>;
          },
          a({ children, href }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline font-medium"
              >
                {children}
              </a>
            );
          },
          blockquote({ children }) {
            return (
              <blockquote className="border-l-4 border-primary/50 pl-4 italic my-2 text-muted-foreground">
                {children}
              </blockquote>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
