import { Button } from "@/components/ui/button";
import { useSettingsStore } from "../../store";
import { AccordionSection } from "../ui/accordion-section";
import { SettingsCheckboxOption } from "../ui/settings-checkbox-option";

export const AdvancedSettingsSection: React.FC = () => {
  const {
    isDevMode,
    updateIsDevMode,

    enablePochiModels,
    updateEnablePochiModels,

    enableVSCodeModels,
    updateEnableVSCodeModels,
  } = useSettingsStore();

  return (
    <AccordionSection title="Advanced Settings">
      <div className="flex flex-col gap-4 px-6">
        {isDevMode !== undefined && (
          <SettingsCheckboxOption
            id="dev-mode"
            label="Developer Mode"
            checked={isDevMode}
            onCheckedChange={(checked) => {
              updateIsDevMode(!!checked);
            }}
          />
        )}
        {isDevMode && (
          <>
            <SettingsCheckboxOption
              id="enable-pochi-models"
              label="Enable Pochi Models"
              checked={enablePochiModels}
              onCheckedChange={(checked) => {
                updateEnablePochiModels(!!checked);
              }}
            />
            <SettingsCheckboxOption
              id="enable-vscode-models"
              label="Enable VSCode Models"
              checked={enableVSCodeModels}
              onCheckedChange={(checked) => {
                updateEnableVSCodeModels(!!checked);
              }}
            />
            <div>
              <Button
                variant="destructive"
                onClick={async () => {
                  const opfsRoot = await navigator.storage.getDirectory();
                  if (
                    "remove" in opfsRoot &&
                    typeof opfsRoot.remove === "function"
                  ) {
                    await opfsRoot.remove();
                  }
                }}
              >
                Clear Storage
              </Button>
            </div>
          </>
        )}
      </div>
    </AccordionSection>
  );
};
