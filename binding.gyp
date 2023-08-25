{
  "targets": [
    {
      "target_name": "action_after_build",
      "type": "none",
      "dependencies": [
        "<(module_name)"
      ],
      "copies": [
        {
          "files": [
            "<(PRODUCT_DIR)/<(module_name).node"
          ],
          "destination": "<(module_path)"
        }
      ]
    },
    {
      "target_name": "raw_socket",
      "sources": [
        "src/raw.cc"
      ],
      "include_dirs": [
        "<!(node -e \"require('nan')\")"
      ],
      "conditions": [
        [
          "OS==\"win\"",
          {
            "libraries": [
              "ws2_32.lib"
            ]
          }
        ]
      ]
    }
  ]
}
