import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

type Props = {
  children: string;
  className?: string;
  variant?: "sans" | "serif";
};

export function Markdown({ children, className, variant = "sans" }: Props) {
  return (
    <div
      className={cn(
        "max-w-none",
        variant === "serif"
          ? "font-serif text-[16px] leading-[1.65] text-ink"
          : "text-[14px] leading-[1.6] text-ink",
        // paragraphs
        "[&_p]:my-3",
        // lists
        "[&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5",
        "[&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5",
        "[&_li]:my-1",
        // inline code
        "[&_code]:font-mono [&_code]:text-[0.9em] [&_code]:rounded [&_code]:bg-bg-soft [&_code]:px-1.5 [&_code]:py-0.5",
        // code blocks
        "[&_pre]:my-4 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:border-l-2 [&_pre]:border-red [&_pre]:bg-bg-soft [&_pre]:p-4",
        "[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-[13px] [&_pre_code]:leading-[1.7] [&_pre_code]:text-ink",
        // links
        "[&_a]:text-red [&_a]:underline [&_a]:underline-offset-2 [&_a]:decoration-[1px] hover:[&_a]:text-red-deep",
        // headings
        "[&_h1]:mt-5 [&_h1]:mb-2 [&_h1]:text-[18px] [&_h1]:font-semibold [&_h1]:tracking-tight",
        "[&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:text-[15px] [&_h2]:font-semibold [&_h2]:tracking-tight",
        "[&_h3]:mt-3 [&_h3]:mb-1 [&_h3]:text-[14px] [&_h3]:font-medium",
        // emphasis
        "[&_strong]:font-semibold [&_strong]:text-ink",
        "[&_em]:italic",
        // blockquote
        "[&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-hairline-strong [&_blockquote]:pl-3 [&_blockquote]:text-ink-mid",
        // sup (citation superscripts)
        "[&_sup]:text-red",
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
