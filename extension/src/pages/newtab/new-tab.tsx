import { Button, Card, CardBody, CardHeader, Input } from "@heroui/react";
import React, { useState } from "react";
import { Icon } from "@iconify/react";

export function NewTab(): JSX.Element {
  const [searchQuery, setSearchQuery] = useState("");

  const handleSearch = () => {
    if (searchQuery.trim()) {
      chrome.tabs.create({
        url: `https://www.google.com/search?q=${encodeURIComponent(
          searchQuery
        )}`,
      });
    }
  };

  return (
    <div className="min-h-screen p-8 ">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Icon
              icon="mdi:extension"
              className="text-4xl text-indigo-600 dark:text-indigo-400"
            />
            <h1
              data-testid="extension-newtab-title"
              className="text-4xl font-bold text-gray-800 dark:text-white"
            >
              Extension New Tab
            </h1>
          </div>
          <p className="text-lg text-gray-600 dark:text-gray-400">
            Your personalized new tab experience
          </p>
        </div>

        {/* Search Section */}
        <Card className="mb-8 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardHeader>
            <h2 className="text-xl font-semibold text-gray-800 dark:text-white">
              Search
            </h2>
          </CardHeader>
          <CardBody>
            <div className="flex gap-2">
              <Input
                placeholder="Search the web..."
                value={searchQuery}
                onChange={(error) => setSearchQuery(error.target.value)}
                onKeyDown={(error) => error.key === "Enter" && handleSearch()}
                startContent={
                  <Icon
                    icon="mdi:web"
                    width={20}
                    className="text-gray-400 dark:text-gray-500"
                  />
                }
              />
              <Button
                color="primary"
                onPress={handleSearch}
                startContent={<Icon icon="mdi:magnify" width={20} />}
              >
                Search
              </Button>
            </div>
          </CardBody>
        </Card>

        {/* Quick Actions */}
        <Card className="mb-8 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardHeader>
            <h2 className="text-xl font-semibold text-gray-800 dark:text-white">
              Actions
            </h2>
          </CardHeader>
          <CardBody>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Button
                color="primary"
                variant="flat"
                className="h-16 text-left justify-start bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600"
                onPress={() => {
                  chrome.tabs.create({ url: "chrome://extensions" });
                }}
                startContent={<Icon icon="mdi:puzzle" className="text-2xl" />}
              >
                <div className="text-left">
                  <div className="font-semibold text-gray-800 dark:text-white">
                    Extensions Settings
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    Manage your extensions
                  </div>
                </div>
              </Button>

              <Button
                color="secondary"
                variant="flat"
                className="h-16 text-left justify-start bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600"
                onPress={() => {
                  chrome.runtime.openOptionsPage();
                }}
                startContent={<Icon icon="mdi:cog" className="text-2xl" />}
              >
                <div className="text-left">
                  <div className="font-semibold text-gray-800 dark:text-white">
                    Extension Options
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    Configure settings
                  </div>
                </div>
              </Button>
            </div>
          </CardBody>
        </Card>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardBody className="text-center p-6">
              <Icon
                icon="mdi:shield-check"
                className="text-3xl text-green-600 dark:text-green-400 mx-auto mb-3"
              />
              <h3 className="font-semibold mb-2 text-gray-800 dark:text-white">
                Secure
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Built with security in mind
              </p>
            </CardBody>
          </Card>

          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardBody className="text-center p-6">
              <Icon
                icon="mdi:rocket-launch"
                className="text-3xl text-blue-600 dark:text-blue-400 mx-auto mb-3"
              />
              <h3 className="font-semibold mb-2 text-gray-800 dark:text-white">
                Fast
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Optimized for performance
              </p>
            </CardBody>
          </Card>

          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardBody className="text-center p-6">
              <Icon
                icon="mdi:palette"
                className="text-3xl text-purple-600 dark:text-purple-400 mx-auto mb-3"
              />
              <h3 className="font-semibold mb-2 text-gray-800 dark:text-white">
                Beautiful
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Modern and clean design
              </p>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
