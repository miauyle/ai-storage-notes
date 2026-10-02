cmake_minimum_required(VERSION 3.16)
project(ai_storage_cpp_labs LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
find_package(Threads REQUIRED)
include(CTest)

add_executable(ownership_lab ownership_lab.cpp)
target_link_libraries(ownership_lab PRIVATE Threads::Threads)
target_compile_options(ownership_lab PRIVATE -Wall -Wextra -Wpedantic)
add_test(NAME ownership_and_async COMMAND ownership_lab)

add_executable(failure_injection_sim failure_injection_sim.cpp)
target_compile_options(failure_injection_sim PRIVATE -Wall -Wextra -Wpedantic)
if(BUILD_TESTING)
  find_package(Python3 3.9 COMPONENTS Interpreter REQUIRED)
  add_test(NAME restore_recompute_model
    COMMAND ${Python3_EXECUTABLE} ${CMAKE_CURRENT_SOURCE_DIR}/test_restore_recompute.py)
  add_test(NAME failure_injection_invariants
    COMMAND ${Python3_EXECUTABLE} ${CMAKE_CURRENT_SOURCE_DIR}/test_failure_injection.py $<TARGET_FILE:failure_injection_sim>)
  set_tests_properties(restore_recompute_model failure_injection_invariants PROPERTIES TIMEOUT 30)
endif()

option(BUILD_S3_PROBE "Build the libcurl HTTPS Range GET exercise" ON)
if(BUILD_S3_PROBE)
  find_package(CURL 7.85 REQUIRED)
  add_executable(s3_range_probe s3_range_probe.cpp)
  target_link_libraries(s3_range_probe PRIVATE CURL::libcurl)
  target_compile_options(s3_range_probe PRIVATE -Wall -Wextra -Wpedantic)
  add_executable(async_range_pipeline async_range_pipeline.cpp)
  target_link_libraries(async_range_pipeline PRIVATE CURL::libcurl Threads::Threads)
  target_compile_options(async_range_pipeline PRIVATE -Wall -Wextra -Wpedantic)
  if(BUILD_TESTING)
    add_test(NAME range_protocol_contract
      COMMAND ${Python3_EXECUTABLE} ${CMAKE_CURRENT_SOURCE_DIR}/test_range_probe.py $<TARGET_FILE:s3_range_probe>)
    add_test(NAME async_pipeline_contract
      COMMAND ${Python3_EXECUTABLE} ${CMAKE_CURRENT_SOURCE_DIR}/test_async_pipeline.py $<TARGET_FILE:async_range_pipeline> $<TARGET_FILE:s3_range_probe>)
    set_tests_properties(range_protocol_contract PROPERTIES TIMEOUT 60)
    set_tests_properties(async_pipeline_contract PROPERTIES TIMEOUT 180)
  endif()
endif()

# Deliberately broken exercise: never built or executed by the default tests.
option(BUILD_BAD_EXAMPLE "Build intentional use-after-free for ASan practice" OFF)
if(BUILD_BAD_EXAMPLE)
  add_executable(bad_lifetime bad_lifetime.cpp)
  target_compile_options(bad_lifetime PRIVATE -O0 -g -fsanitize=address -fno-omit-frame-pointer)
  target_link_options(bad_lifetime PRIVATE -fsanitize=address)
endif()
