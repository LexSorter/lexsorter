import { Download } from "lucide-react";
import { DISPLAY_CATEGORIES, type ProviderName, type ProviderResults } from "../lib/types";

const numberFormatter = new Intl.NumberFormat("en-US");

type ResultsTableProps = {
  results: ProviderResults;
  totalCompleted: number;
  onExport: (provider: ProviderName) => void | Promise<void>;
};

export function getVisibleResultCategories(results: ProviderResults): ProviderName[] {
  return DISPLAY_CATEGORIES.filter((provider) => results[provider].length > 0);
}

export function ResultsTable({ results, totalCompleted, onExport }: ResultsTableProps) {
  const visibleProviders = getVisibleResultCategories(results);

  if (visibleProviders.length === 0) {
    return (
      <div className="results-table-wrap results-empty" role="status">
        No provider results to display.
      </div>
    );
  }

  return (
    <div className="results-table-wrap">
      <table>
        <thead>
          <tr>
            <th>Provider</th>
            <th>Emails</th>
            <th>Share</th>
            <th><span className="sr-only">Action</span></th>
          </tr>
        </thead>
        <tbody>
          {visibleProviders.map((provider) => {
            const count = results[provider].length;
            const share = totalCompleted ? (count / totalCompleted) * 100 : 0;
            return (
              <tr key={provider}>
                <td>
                  <span className={`provider-dot provider-${provider.toLowerCase().replaceAll(" ", "-").replace(".", "-")}`} aria-hidden="true" />
                  <strong>{provider}</strong>
                </td>
                <td data-label="Emails">{numberFormatter.format(count)}</td>
                <td data-label="Share">{share.toFixed(2)}%</td>
                <td>
                  <button
                    className="export-button"
                    type="button"
                    onClick={() => void onExport(provider)}
                    aria-label={`Export ${provider} list as TXT`}
                  >
                    <Download aria-hidden="true" />
                    Export list
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
