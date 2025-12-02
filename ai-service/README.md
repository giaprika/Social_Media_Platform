adk api_server --host 0.0.0.0 --port 9000 # For api server
adk web --host 0.0.0.0 --port 9000 # for web testing

adk eval eval_agent eval_agent/eval_set_for_testing_moderation_agent.evalset.json
adk eval eval_agent eval_agent/eval_set_for_image_testing_moderation_agent.evalset.json
adk eval eval_agent eval_agent/image_testing_moderation_agent_label_harmful.evalset.json
adk eval eval_agent eval_agent/image_testing_moderation_agent_label_not_harmful.evalset.json

adk eval eval_agent eval_agent/holisafe_hf_evalset_label_unsafety.evalset.json 
adk eval eval_agent eval_agent/holisafe_hf_evalset_label_safety.evalset.json

adk eval eval_agent eval_agent/holisafe_hf_evalset.evalset.json --print_detailed_results
