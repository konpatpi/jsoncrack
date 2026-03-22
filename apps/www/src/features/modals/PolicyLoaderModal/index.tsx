import React from "react";
import type { ModalProps } from "@mantine/core";
import {
  Modal,
  Stack,
  Button,
  Text,
  Group,
  Select,
  Alert,
  Loader,
} from "@mantine/core";
import { LuCheck, LuInfo } from "react-icons/lu";
import { FaCog } from "react-icons/fa";
import useGitHub from "../../../store/useGitHub";

type ProductLine = "mpo" | "fbb" | "iot";

interface RepoInfo {
  name: string;
  full_name: string;
}

export const PolicyLoaderModal = ({ opened, onClose }: ModalProps) => {
  const token = useGitHub(state => state.token);
  const savedConfig = useGitHub(state => state.policyConfig);
  const setPolicyConfig = useGitHub(state => state.setPolicyConfig);

  const [productLine, setProductLine] = React.useState<ProductLine | null>(savedConfig.productLine);
  const [activities, setActivities] = React.useState<RepoInfo[]>([]);
  const [selectedActivity, setSelectedActivity] = React.useState<string | null>(savedConfig.activity);
  const [selectedActivityBranch, setSelectedActivityBranch] = React.useState<string>(savedConfig.activityBranch);
  const [selectedCommonBranch, setSelectedCommonBranch] = React.useState<string>(savedConfig.commonBranch);
  const [loadingActivities, setLoadingActivities] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  // Sync state with saved config when modal opens
  React.useEffect(() => {
    if (opened) {
      setProductLine(savedConfig.productLine);
      setSelectedActivity(savedConfig.activity);
      setSelectedActivityBranch(savedConfig.activityBranch);
      setSelectedCommonBranch(savedConfig.commonBranch);
    }
  }, [opened, savedConfig]);

  const branchOptions = [
    { value: "main", label: "main" },
    { value: "master", label: "master" },
    { value: "develop", label: "develop" },
  ];

  const productLineOptions = [
    { value: "mpo", label: "MPO - Mobile Postpaid" },
    { value: "fbb", label: "FBB - Fixed Broadband" },
    { value: "iot", label: "IOT - Internet of Things" },
  ];

  // Fetch activities when product line changes
  React.useEffect(() => {
    if (!productLine || !token) {
      setActivities([]);
      setSelectedActivity(null);
      return;
    }

    const fetchActivities = async () => {
      setLoadingActivities(true);
      setError(null);
      setActivities([]);
      setSelectedActivity(null);

      try {
        // Search for repos matching pattern: sky-{productLine}*-onboarding-activity
        const searchQuery = `sky-${productLine} onboarding-activity in:name org:corp-ais`;
        const res = await fetch(
          `https://api.github.com/search/repositories?q=${encodeURIComponent(searchQuery)}&per_page=100`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/vnd.github+json",
            },
          }
        );

        if (!res.ok) {
          throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
        }

        const data = await res.json();
        const filtered = data.items.filter((repo: RepoInfo) =>
          repo.name.match(new RegExp(`^sky-${productLine}.*-onboarding-activity$`))
        );

        setActivities(filtered);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch activities");
      } finally {
        setLoadingActivities(false);
      }
    };

    fetchActivities();
  }, [productLine, token]);

  const handleSaveConfig = () => {
    if (!productLine || !selectedActivity) {
      setError("Please select a Product Line and Activity Repository.");
      return;
    }

    setPolicyConfig({
      productLine,
      activity: selectedActivity,
      activityBranch: selectedActivityBranch,
      commonBranch: selectedCommonBranch,
      fileType: savedConfig.fileType,
      searchText: savedConfig.searchText,
    });

    setSuccess("Configuration saved successfully.");

    // Close modal after short delay
    setTimeout(() => {
      onClose();
      setSuccess(null);
    }, 1000);
  };

  const handleClose = () => {
    setError(null);
    setSuccess(null);
    onClose();
  };

  const hasToken = Boolean(token);

  return (
    <Modal
      title={
        <Group gap="xs">
          <FaCog size={18} />
          <Text fw={600}>Policy Configuration</Text>
        </Group>
      }
      opened={opened}
      onClose={handleClose}
      centered
      size="md"
    >
      <Stack gap="md">
        {/* GitHub Token Status */}
        {!hasToken && (
          <Alert color="yellow" icon={<LuInfo />} title="GitHub Token Required">
            <Text size="sm">
              Please go to GitHub Configuration to set up your Personal Access Token first.
            </Text>
          </Alert>
        )}

        {/* Product Line Selection */}
        <Select
          label="Product Line"
          placeholder="Select Product Line"
          data={productLineOptions}
          value={productLine}
          onChange={value => setProductLine(value as ProductLine | null)}
          disabled={!hasToken}
          clearable
        />

        {/* Activity Selection */}
        <Select
          label="Activity Repository"
          placeholder={
            loadingActivities
              ? "Loading activities..."
              : !productLine
                ? "Select a Product Line first"
                : activities.length === 0
                  ? "No activity repos found"
                  : "Select Activity"
          }
          data={activities.map(repo => ({
            value: repo.full_name,
            label: repo.name,
          }))}
          value={selectedActivity}
          onChange={setSelectedActivity}
          disabled={!hasToken || !productLine || loadingActivities || activities.length === 0}
          clearable
          leftSection={loadingActivities ? <Loader size="xs" /> : undefined}
        />

        {/* Common Branch Selection */}
        <Select
          label="Common Branch"
          placeholder="Select branch for Common"
          data={branchOptions}
          value={selectedCommonBranch}
          onChange={value => setSelectedCommonBranch(value || "develop")}
          disabled={!hasToken}
        />

        {/* Activity Branch Selection */}
        <Select
          label="Activity Branch"
          placeholder="Select branch for Activity"
          data={branchOptions}
          value={selectedActivityBranch}
          onChange={value => setSelectedActivityBranch(value || "develop")}
          disabled={!hasToken}
        />

        {/* Error Alert */}
        {error && (
          <Alert color="red" icon={<LuInfo />} title="Error">
            <Text size="xs" style={{ whiteSpace: "pre-wrap" }}>{error}</Text>
          </Alert>
        )}

        {/* Success Alert */}
        {success && (
          <Alert color="green" icon={<LuCheck />} title="Success">
            <Text size="xs">{success}</Text>
          </Alert>
        )}

        {/* Actions */}
        <Group justify="flex-end">
          <Button variant="default" onClick={handleClose} size="sm">
            Cancel
          </Button>
          <Button
            onClick={handleSaveConfig}
            disabled={!hasToken || !productLine || !selectedActivity}
            size="sm"
            leftSection={<FaCog size={16} />}
          >
            Save Configuration
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};
