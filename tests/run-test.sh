#!/bin/bash

WORKER_URL="http://localhost:8787"
TEST_FILE="tests/common-test.md"
AUTH_TOKEN="6fY8p2xT$vK9zQ7wL#mN3rD1jH5gS4bE0aF"

echo "Starting URL tests..."

# Extract URLs from the test file (handles http and https)
urls=$(grep -Eo '(http|https)://[^ >]+' "$TEST_FILE")

if [ -z "$urls" ]; then
    echo "Error: No URLs found in $TEST_FILE"
    exit 1
fi

# Loop through each URL
while IFS= read -r url; do
    # URL encode the target URL for the query parameter
    # Simple encoding for common characters, more robust encoding might be needed for complex URLs
    encoded_url=$(printf %s "$url" | jq -s -R -r @uri)

    # Check if it's a YouTube URL for special handling
    is_youtube=$(echo "$url" | grep -qE 'youtube.com|youtu.be' && echo "true" || echo "false")
    
    if [ "$is_youtube" = "true" ]; then
        echo "Testing YouTube URL: $url"
    fi

    # Make the request to the worker with Authorization header to bypass rate limiting
    response=$(curl -sS -X GET "$WORKER_URL/?url=$encoded_url" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $AUTH_TOKEN")
    exit_code=$?

    if [ $exit_code -ne 0 ]; then
        echo "Error: curl command failed for URL: $url (Exit code: $exit_code)"
        continue
    fi

    # Check if the response is valid JSON
    echo "$response" | jq -e '.' >/dev/null 2>&1
    if [ $? -ne 0 ]; then
        echo "Error: Invalid JSON response for URL: $url"
        echo "  Response: $response"
        continue
    fi

    # Special handling for YouTube to diagnose issues
    if [ "$is_youtube" = "true" ]; then
        youtube_md=$(echo "$response" | jq -r '.[0].md')
        echo "YouTube Response:"
        echo "$youtube_md" | head -10
        
        # Check for undefined values
        if echo "$youtube_md" | grep -q "undefined"; then
            echo "Error: YouTube response contains undefined values"
        else
            echo "YouTube extraction succeeded!"
        fi
        echo "----------------------------------------"
        continue
    fi

    # General error checks
    error_check=$(echo "$response" | jq -e '.[0] | (.error == true or (.md | type == "string" and (contains("Failed to") or contains("Rate limit"))))' 2>/dev/null)
    jq_exit_code=$?

    if [ $jq_exit_code -eq 0 ]; then
        # jq ran successfully and found an error indicator
        error_message=$(echo "$response" | jq -r '.[0].md // (.[0].errorDetails // "Unknown error")' 2>/dev/null)
        echo "Error detected for URL: $url"
        echo "  Message: $error_message"
    fi

done <<< "$urls"

echo "URL tests finished."
