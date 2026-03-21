import { Menu, Flex, SegmentedControl, Switch, Divider, Text } from "@mantine/core";
import { useSessionStorage } from "@mantine/hooks";
import { event as gaEvent } from "nextjs-google-analytics";
import { CgChevronDown } from "react-icons/cg";
import { ViewMode } from "../../../enums/viewMode.enum";
import useConfig from "../../../store/useConfig";
import useFile from "../../../store/useFile";
import { StyledToolElement } from "./styles";

export const ViewMenu = () => {
  const [viewMode, setViewMode] = useSessionStorage({
    key: "viewMode",
    defaultValue: ViewMode.Graph,
  });
  const compactConditionsEnabled = useConfig(state => state.compactConditionsEnabled);
  const toggleCompactConditions = useConfig(state => state.toggleCompactConditions);
  const getContents = useFile(state => state.getContents);
  const setContents = useFile(state => state.setContents);

  const handleToggleCompact = (enabled: boolean) => {
    toggleCompactConditions(enabled);
    // Re-process current content immediately
    const current = getContents();
    if (current) setContents({ contents: current, hasChanges: false });
  };

  return (
    <Menu shadow="md" closeOnItemClick={false} withArrow>
      <Menu.Target>
        <StyledToolElement onClick={() => gaEvent("show_view_menu")}>
          <Flex align="center" gap={3}>
            View <CgChevronDown />
          </Flex>
        </StyledToolElement>
      </Menu.Target>
      <Menu.Dropdown>
        <SegmentedControl
          size="md"
          w="100%"
          value={viewMode}
          onChange={e => {
            setViewMode(e as ViewMode);
            gaEvent("change_view_mode", { label: e });
          }}
          data={[
            { value: ViewMode.Graph, label: "Graph" },
            { value: ViewMode.Tree, label: "Tree" },
          ]}
          fullWidth
          orientation="vertical"
        />
        <Divider my="xs" />
        <Menu.Item closeMenuOnClick={false}>
          <Flex align="center" justify="space-between" gap="md">
            <Text size="xs">Compact Policy Conditions</Text>
            <Switch
              size="xs"
              checked={compactConditionsEnabled}
              onChange={e => handleToggleCompact(e.currentTarget.checked)}
            />
          </Flex>
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
};
