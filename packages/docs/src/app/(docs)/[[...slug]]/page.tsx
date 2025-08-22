import { formatTitle } from "@/app/layout.config";
import { source } from "@/lib/source";
import { getMDXComponents } from "@/mdx-components";
import { createRelativeLink } from "fumadocs-ui/mdx";
import { DocsBody, DocsPage, DocsTitle } from "fumadocs-ui/page";
import { Edit3 } from "lucide-react";
import { notFound } from "next/navigation";

export default async function Page(props: {
  params: Promise<{ slug?: string[] }>;
}) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  const MDXContent = page.data.body;

  // Construct the file path for GitHub edit
  const filePath = page.slugs.join('/');

  return (
    <DocsPage 
      toc={page.data.toc} 
      full={page.data.full}
      tableOfContent={{
        header: (
          <a
            href={`https://github.com/TabbyML/pochi/blob/main/packages/docs/content/docs/${filePath ? `${filePath}` : 'index'}.mdx`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-fd-muted-foreground hover:text-fd-foreground transition-colors mb-10"
          >
            <Edit3 className="w-4 h-4" />
            Edit on GitHub
          </a>
        )
      }}
      editOnGithub={
        {
          owner: 'TabbyML',
          repo: 'pochi',
          sha: 'main',
          path: `/packages/docs/content/docs/${filePath ? `${filePath}` : 'index'}.mdx`,
        }
      }
    >
      <DocsBody>
        <MDXContent
          components={getMDXComponents({
            // this allows you to link to other pages with relative file paths
            a: createRelativeLink(source, page),
          })}
        />
      </DocsBody>
    </DocsPage>
  );
}

export async function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata(props: {
  params: Promise<{ slug?: string[] }>;
}) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  return {
    title: formatTitle(page.data.title),
    description: page.data.description,
  };
}
